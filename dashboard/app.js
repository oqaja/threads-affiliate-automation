"use strict";
/* Threads Affiliate — Dashboard (PWA, read-only view + status controlling) */

const LS = {
  pat: "taa_gh_pat",
  theme: "taa_theme",
  filters: "taa_filters",
};
const ADMIN_WORKFLOW = "threads-admin.yml";
const DATA_WORKFLOW = "dashboard.yml";

const state = {
  data: null,
  error: null,
  filters: { status: new Set(), pilar: new Set(), sort: "jam-asc" },
};

/* ---------- utils ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const timeAgo = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (isNaN(d)) return "—";
  if (d < 90) return "baru aja";
  if (d < 3600) return `${Math.round(d / 60)} mnt lalu`;
  if (d < 86400) return `${Math.round(d / 3600)} jam lalu`;
  return `${Math.round(d / 86400)} hari lalu`;
};

/* ---------- status + pilar styling ---------- */
function statusInfo(raw) {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return { cls: "status-mute", label: "Kosong" };
  if (s === "acc") return { cls: "status-warn", label: "Acc" };
  if (s === "gagal" || s === "error") return { cls: "status-err", label: "Gagal" };
  if (s === "published" || s === "uploaded") return { cls: "status-ok", label: raw };
  if (s.includes("posted") || s === "scheduled") return { cls: "status-info", label: raw };
  return { cls: "status-info", label: raw };
}
const PILAR_COLORS = {
  "cerita personal": "#e0669a",
  "myth-busting": "#7c5cff",
  "tren & counter-tren": "#0ea5a3",
  "edukasi praktis": "#2f7ae5",
  komparasi: "#e0803a",
  "tanya balik-polling": "#c04ddd",
  "rekomendasi kurasi": "#3aa76d",
};
function pilarColor(p) {
  const k = (p || "").trim().toLowerCase();
  if (PILAR_COLORS[k]) return PILAR_COLORS[k];
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 55%)`;
}

/* ---------- content placeholder resolve (client-side, mirror of publishThreads) ---------- */
function stripInstruction(text) {
  return String(text || "")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (/^\[.*\]$/.test(t)) return false;
      if (/script\s+(otomatis|auto)?\s*-?\s*replace/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function resolvePreview(text, brand, link) {
  let out = String(text || "");
  if (brand) out = out.split("[Brand/Produk]").join(brand);
  if (link) out = out.split("[Link Affiliate]").join(link);
  return stripInstruction(out);
}

/* ---------- GitHub dispatch (write path, optional PAT) ---------- */
function getPat() {
  try { return localStorage.getItem(LS.pat) || ""; } catch { return ""; }
}
async function dispatchWorkflow(workflowFile, inputs) {
  const pat = getPat();
  const repo = state.data?.repo || "oqaja/threads-affiliate-automation";
  if (!pat) throw new Error("no-pat");
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });
  if (res.status === 204) return true;
  const body = await res.text().catch(() => "");
  throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
}

/* ---------- links ---------- */
const sheetRowUrl = (d, row) =>
  `https://docs.google.com/spreadsheets/d/${d.sheetId}/edit#gid=${d.sheetGid}&range=A${row}:O${row}`;
const docUrl = (d) => `https://docs.google.com/document/d/${d.docId}/edit`;
const driveUrl = (d) => `https://drive.google.com/drive/folders/${d.driveFolderId}`;
const threadsPostUrl = (id) => (id ? `https://www.threads.net/t/${id}` : null);

/* ---------- toast ---------- */
function toast(msg, kind = "") {
  const t = el("div", { class: `toast ${kind}` }, msg);
  $("#toast-root").append(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------- modal ---------- */
function openModal(node) {
  const root = $("#modal-root");
  const overlay = el("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) closeModal(); } }, node);
  root.append(overlay);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", escClose);
}
function escClose(e) { if (e.key === "Escape") closeModal(); }
function closeModal() {
  $("#modal-root").innerHTML = "";
  document.body.style.overflow = "";
  document.removeEventListener("keydown", escClose);
}

/* ---------- detail modal ---------- */
function openDetail(item) {
  const d = state.data;
  let mode = "raw";
  const parts = () => {
    const c = item.content || { utas1: "", utas2: "", reply: "" };
    const render = (label, raw) => {
      const text = mode === "preview" ? resolvePreview(raw, item.brand, item.link) : (raw || "").trim();
      const len = [...text].length;
      const over = len > (d.threadsMaxText || 500);
      return el("div", { class: "utas" },
        el("div", { class: "lbl" }, label, el("span", { class: `c ${over ? "over" : ""}` }, `${len} char`)),
        el("p", {}, text || "—")
      );
    };
    return [render("Utas 1 — Hook", c.utas1), render("Utas 2 — Produk", c.utas2), render("Reply — Link", c.reply)];
  };

  const body = el("div", { class: "sheet" });
  const draw = () => {
    body.innerHTML = "";
    [
      el("div", { class: "sheet-head" },
        el("h2", {}, item.judul),
        el("button", { class: "sheet-close", onclick: closeModal, "aria-label": "Tutup" }, "✕")
      ),
      el("div", { class: "meta", style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px" },
        pilarBadge(item.pilar), statusBadge(item.status),
        item.jam ? el("span", { class: "sub" }, `⏰ ${item.jam}`) : null,
      ),
      item.brand ? el("div", { class: "sub", style: "margin-bottom:4px" }, el("b", {}, "Brand: "), item.brand) : null,
      item.hasContent
        ? el("div", { class: "seg" },
            el("button", { class: mode === "raw" ? "on" : "", onclick: () => { mode = "raw"; draw(); } }, "Raw (Docs)"),
            el("button", { class: mode === "preview" ? "on" : "", onclick: () => { mode = "preview"; draw(); } }, "Preview terkirim")
          )
        : el("div", { class: "hint" }, "⚠ Blok Docs untuk judul ini tidak ketemu — cek penulisan Judul Konten di Docs."),
      ...(item.hasContent ? parts() : []),
      el("div", { class: "links" },
        el("a", { class: "btn sm", href: sheetRowUrl(d, item.row), target: "_blank", rel: "noopener" }, "↗ Baris di Sheets"),
        el("a", { class: "btn sm", href: docUrl(d), target: "_blank", rel: "noopener" }, "↗ Docs"),
        item.postId1 ? el("a", { class: "btn sm", href: threadsPostUrl(item.postId1), target: "_blank", rel: "noopener" }, "↗ Utas 1 di Threads") : null,
      ),
      item.catatan ? el("div", { class: "hint", style: "margin-top:12px" }, `Catatan: ${item.catatan}`) : null,
    ].filter(Boolean).forEach((n) => body.append(n));
  };
  draw();
  openModal(body);
}

/* ---------- settings modal ---------- */
function openSettings() {
  const cur = getPat();
  const input = el("input", { type: "password", value: cur, placeholder: "github_pat_…", autocomplete: "off" });
  const body = el("div", { class: "sheet" },
    el("div", { class: "sheet-head" }, el("h2", {}, "Pengaturan"), el("button", { class: "sheet-close", onclick: closeModal }, "✕")),
    el("p", { class: "hint" },
      "GitHub PAT dipakai buat tombol Approve & Refresh (trigger workflow). Disimpan HANYA di browser ini (localStorage), tidak pernah di-commit. Tanpa PAT, Approve jadi link ke Sheets."
    ),
    el("label", { class: "field" }, el("span", {}, "GitHub Fine-grained PAT"), input),
    el("p", { class: "hint" },
      "Buat di GitHub → Settings → Developer settings → Fine-grained tokens. Repository access: ",
      el("b", {}, (state.data?.repo || "repo")),
      ". Permission: ", el("b", {}, "Actions → Read and write"), "."
    ),
    el("div", { class: "links" },
      el("button", { class: "btn primary", onclick: () => {
        try { input.value.trim() ? localStorage.setItem(LS.pat, input.value.trim()) : localStorage.removeItem(LS.pat); } catch {}
        toast("Tersimpan", "ok"); closeModal();
      } }, "Simpan"),
      el("button", { class: "btn ghost", onclick: () => { try { localStorage.removeItem(LS.pat); } catch {} toast("PAT dihapus"); closeModal(); } }, "Hapus PAT"),
    )
  );
  openModal(body);
}

/* ---------- approve ---------- */
async function approve(item, btn) {
  const d = state.data;
  if (!getPat()) {
    if (confirm(`Belum ada GitHub PAT. Buka Sheets buat set STATUS "${item.judul}" jadi Acc manual?`)) {
      window.open(sheetRowUrl(d, item.row), "_blank", "noopener");
    }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "Mengirim…"; }
  try {
    await dispatchWorkflow(ADMIN_WORKFLOW, {
      action: "set-cell",
      judul: item.judul,
      col: "STATUS THREADS",
      value: "Acc",
    });
    toast(`Approve dikirim: "${item.judul}" → Acc. Data refresh ~1 menit.`, "ok");
    if (btn) btn.textContent = "Terkirim ✓";
  } catch (e) {
    toast(e.message === "no-pat" ? "Set PAT dulu di ⚙ Pengaturan" : `Gagal: ${e.message}`, "err");
    if (btn) { btn.disabled = false; btn.textContent = "Approve → Acc"; }
  }
}

async function refreshData(btn) {
  if (getPat()) {
    try {
      await dispatchWorkflow(DATA_WORKFLOW, {});
      toast("Rebuild data dipicu — tunggu ~1–2 menit lalu reload.", "ok");
    } catch (e) {
      toast(`Rebuild gagal: ${e.message}. Coba lagi nanti.`, "err");
    }
  }
  // selalu coba ambil ulang snapshot terbaru
  await loadData(true);
}

/* ---------- badges ---------- */
function statusBadge(status) {
  const s = statusInfo(status);
  return el("span", { class: `badge ${s.cls}` }, s.label);
}
function pilarBadge(pilar) {
  if (!pilar) return el("span", { class: "badge pilar" }, "—");
  return el("span", { class: "badge pilar", style: `--p-color:${pilarColor(pilar)}` },
    el("span", { class: "dot" }), pilar);
}

/* ---------- list view ---------- */
function applyFilters(items) {
  const f = state.filters;
  let out = items.filter((it) => {
    if (f.status.size) {
      const key = (it.status || "").trim().toLowerCase() || "(kosong)";
      if (!f.status.has(key)) return false;
    }
    if (f.pilar.size && !f.pilar.has((it.pilar || "").trim().toLowerCase())) return false;
    return true;
  });
  const [by, dir] = f.sort.split("-");
  out.sort((a, b) => {
    let r = 0;
    if (by === "jam") r = (a.jamMin ?? 9999) - (b.jamMin ?? 9999);
    else if (by === "judul") r = a.judul.localeCompare(b.judul);
    else if (by === "status") r = (a.status || "").localeCompare(b.status || "");
    return dir === "desc" ? -r : r;
  });
  return out;
}

function renderList() {
  const app = $("#app");
  app.innerHTML = "";
  const d = state.data;
  const items = d.items;

  const statuses = ["(kosong)", ...new Set(items.map((i) => (i.status || "").trim().toLowerCase()).filter(Boolean))];
  const pilars = [...new Set(items.map((i) => (i.pilar || "").trim().toLowerCase()).filter(Boolean))];

  const chip = (label, set, key) =>
    el("button", {
      class: "chip", "aria-pressed": set.has(key) ? "true" : "false",
      onclick: (e) => {
        set.has(key) ? set.delete(key) : set.add(key);
        e.target.setAttribute("aria-pressed", set.has(key) ? "true" : "false");
        saveFilters(); drawGrid();
      },
    }, label);

  const controls = el("div", { class: "controls" },
    el("div", { class: "chipset" }, ...statuses.map((s) => chip(s === "(kosong)" ? "Kosong" : cap(s), state.filters.status, s))),
    el("div", { class: "chipset" }, ...pilars.map((p) => chip(cap(p), state.filters.pilar, p))),
    el("div", { class: "spacer" }),
    el("select", {
      onchange: (e) => { state.filters.sort = e.target.value; saveFilters(); drawGrid(); },
    },
      opt("jam-asc", "Jam ↑", state.filters.sort),
      opt("jam-desc", "Jam ↓", state.filters.sort),
      opt("judul-asc", "Judul A-Z", state.filters.sort),
      opt("status-asc", "Status", state.filters.sort),
    ),
  );
  app.append(controls);

  const note = el("div", { class: "count-note" });
  app.append(note);
  const gridWrap = el("div", {});
  app.append(gridWrap);

  function drawGrid() {
    const list = applyFilters(items);
    note.textContent = `${list.length} dari ${items.length} konten`;
    gridWrap.innerHTML = "";
    if (!list.length) { gridWrap.append(el("div", { class: "empty" }, "Tidak ada konten yang cocok filter.")); return; }
    const grid = el("div", { class: "grid" });
    for (const it of list) grid.append(card(it));
    gridWrap.append(grid);
  }
  drawGrid();
}

function card(it) {
  const d = state.data;
  const canApprove = !(it.status || "").trim();
  const actions = el("div", { class: "actions" },
    el("button", { class: "btn sm", onclick: () => openDetail(it) }, "Detail"),
    canApprove
      ? el("button", { class: "btn sm primary", onclick: (e) => approve(it, e.currentTarget) }, "Approve → Acc")
      : null,
    el("a", { class: "btn sm ghost", href: sheetRowUrl(d, it.row), target: "_blank", rel: "noopener" }, "Sheets ↗"),
    el("a", { class: "btn sm ghost", href: docUrl(d), target: "_blank", rel: "noopener" }, "Docs ↗"),
  );
  return el("div", { class: "card" },
    el("h3", {}, it.judul),
    el("div", { class: "meta" }, pilarBadge(it.pilar), statusBadge(it.status), it.jam ? el("span", { class: "sub" }, `⏰ ${it.jam}`) : null),
    it.brand ? el("div", { class: "sub" }, el("b", {}, it.brand), it.brandRef ? ` · ref ${it.brandRef}` : "") : null,
    (it.views1 || it.views2) ? el("div", { class: "sub" }, `👁 ${fmt(it.views1 + it.views2)} views · reply ${it.replyRate || 0}%`) : null,
    actions,
  );
}

/* ---------- insight view ---------- */
function renderInsight() {
  const app = $("#app");
  app.innerHTML = "";
  const items = state.data.items;

  const uploaded = items.filter((i) => /published|uploaded/i.test(i.status));
  const totalViews = items.reduce((s, i) => s + i.views1 + i.views2, 0);
  const withRate = items.filter((i) => i.replyRate > 0);
  const avgRate = withRate.length ? withRate.reduce((s, i) => s + i.replyRate, 0) / withRate.length : 0;
  const gagal = items.filter((i) => /gagal|error/i.test(i.status));

  app.append(el("div", { class: "summary" },
    stat("Total konten", fmt(items.length)),
    stat("Uploaded", fmt(uploaded.length)),
    stat("Total views", fmt(totalViews)),
    stat("Avg reply rate", `${avgRate.toFixed(1)}`, "%"),
  ));

  /* per pilar */
  const byPilar = {};
  for (const i of items) {
    const k = i.pilar || "(tanpa pilar)";
    (byPilar[k] ||= { n: 0, views: 0, rate: 0, rateN: 0 });
    byPilar[k].n++;
    byPilar[k].views += i.views1 + i.views2;
    if (i.replyRate > 0) { byPilar[k].rate += i.replyRate; byPilar[k].rateN++; }
  }
  const pilarArr = Object.entries(byPilar).map(([name, v]) => ({
    name, n: v.n, views: v.views, avgRate: v.rateN ? v.rate / v.rateN : 0,
  })).sort((a, b) => b.views - a.views);
  const maxViews = Math.max(1, ...pilarArr.map((p) => p.views));

  app.append(el("div", { class: "section-title" }, "Performa per Pilar"));
  const rows = el("div", { class: "pilar-rows" });
  for (const p of pilarArr) {
    rows.append(el("div", { class: "pilar-row", style: `--p-color:${pilarColor(p.name)}` },
      el("div", { class: "name" }, el("span", { class: "badge pilar", style: `--p-color:${pilarColor(p.name)}` }, el("span", { class: "dot" }), p.name)),
      el("div", { class: "nums" }, `${p.n} konten · ${fmt(p.views)} views · reply ${p.avgRate.toFixed(1)}%`),
      el("div", { class: "bar" }, el("i", { style: `width:${(p.views / maxViews) * 100}%` })),
    ));
  }
  app.append(pilarArr.length ? rows : el("div", { class: "empty" }, "Belum ada data views."));

  /* gagal */
  app.append(el("div", { class: "section-title" }, `Perlu di-retry (${gagal.length})`));
  if (!gagal.length) {
    app.append(el("div", { class: "hint" }, "Tidak ada konten berstatus Gagal. 🎉"));
  } else {
    const g = el("div", { class: "grid" });
    for (const it of gagal) {
      g.append(el("div", { class: "card" },
        el("h3", {}, it.judul),
        el("div", { class: "meta" }, pilarBadge(it.pilar), statusBadge(it.status)),
        it.catatan ? el("div", { class: "sub" }, it.catatan) : null,
        el("div", { class: "actions" },
          el("button", { class: "btn sm", onclick: () => openDetail(it) }, "Detail"),
          el("button", { class: "btn sm primary", onclick: (e) => approve(it, e.currentTarget) }, "Set Acc (retry)"),
          el("a", { class: "btn sm ghost", href: sheetRowUrl(state.data, it.row), target: "_blank", rel: "noopener" }, "Sheets ↗"),
        ),
      ));
    }
    app.append(g);
  }
}
function stat(k, v, unit) {
  return el("div", { class: "stat" }, el("div", { class: "k" }, k),
    el("div", { class: "v" }, v, unit ? el("small", {}, unit) : null));
}

/* ---------- helpers ---------- */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function opt(val, label, cur) {
  const o = el("option", { value: val }, label);
  if (val === cur) o.selected = true;
  return o;
}
function saveFilters() {
  try {
    localStorage.setItem(LS.filters, JSON.stringify({
      status: [...state.filters.status], pilar: [...state.filters.pilar], sort: state.filters.sort,
    }));
  } catch {}
}
function loadFilters() {
  try {
    const f = JSON.parse(localStorage.getItem(LS.filters) || "{}");
    if (f.status) state.filters.status = new Set(f.status);
    if (f.pilar) state.filters.pilar = new Set(f.pilar);
    if (f.sort) state.filters.sort = f.sort;
  } catch {}
}

/* ---------- routing ---------- */
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("active", a.dataset.route === hash));
  if (!state.data) return;
  if (hash === "/insight") renderInsight();
  else renderList();
}

/* ---------- data load ---------- */
async function loadData(silent) {
  try {
    const res = await fetch(`./data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`data.json ${res.status}`);
    state.data = await res.json();
    state.error = null;
    $("#foot-meta").textContent = `${state.data.items.length} konten · data ${timeAgo(state.data.generatedAt)} · ${state.data.sheetName}`;
    route();
  } catch (e) {
    state.error = e.message;
    if (!silent) $("#app").innerHTML = `<div class="empty">Gagal memuat data.json<br><small>${esc(e.message)}</small></div>`;
    if (silent) toast("Data belum berubah / gagal muat ulang", "err");
  }
}

/* ---------- theme ---------- */
function initTheme() {
  let t = "";
  try { t = localStorage.getItem(LS.theme) || ""; } catch {}
  if (t) document.documentElement.setAttribute("data-theme", t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
  if (next) document.documentElement.setAttribute("data-theme", next);
  else document.documentElement.removeAttribute("data-theme");
  try { next ? localStorage.setItem(LS.theme, next) : localStorage.removeItem(LS.theme); } catch {}
}

/* ---------- boot ---------- */
initTheme();
loadFilters();
window.addEventListener("hashchange", route);
$("#btn-theme").addEventListener("click", toggleTheme);
$("#btn-settings").addEventListener("click", openSettings);
$("#btn-refresh").addEventListener("click", (e) => refreshData(e.currentTarget));
loadData();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
