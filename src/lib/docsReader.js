/**
 * docsReader.js
 * Baca Google Doc dan pecah jadi array blok konten. Satu blok = satu konten Threads.
 *
 * Doc = SUMBER TEKS saja (metadata ada di Sheet). Format per blok:
 *
 *   JUDUL: Samba Look Lokal Ver
 *   --- UTAS 1 (Hook) ---
 *   <teks hook, boleh multi-paragraf>
 *   --- UTAS 2 (Produk) ---
 *   <teks produk, boleh pakai [Brand/Produk]>
 *   --- REPLY (Link) ---
 *   <teks reply, pakai [Link Affiliate]>
 *
 * "Judul Konten" di Sheet harus sama persis dengan nilai "JUDUL:" di Doc.
 *
 * Fallback: kalau tidak ada baris "JUDUL:", judul diambil dari baris non-kosong
 * terakhir sebelum "--- UTAS 1 ---" (mis. heading 'CONTOH TERISI — "Samba ..."').
 */

const SECTION_MARKERS = [
  { test: /^-{2,}\s*utas\s*1\b/i, key: "utas1" },
  { test: /^-{2,}\s*utas\s*2\b/i, key: "utas2" },
  { test: /^-{2,}\s*reply\b/i, key: "reply" },
];

const JUDUL_RE = /^\s*judul\s*[:\-]\s*(.+?)\s*$/i;

function matchSectionMarker(line) {
  for (const m of SECTION_MARKERS) if (m.test.test(line.trim())) return m.key;
  return null;
}

/** Ambil semua baris teks paragraf dari struktur Google Docs API. */
function extractLines(doc) {
  const lines = [];
  const content = (doc.body && doc.body.content) || [];
  for (const el of content) {
    if (!el.paragraph) continue;
    const text = (el.paragraph.elements || [])
      .map((e) => (e.textRun && e.textRun.content ? e.textRun.content : ""))
      .join("");
    text.split(/[\n\v]/).forEach((p) => lines.push(p.trimEnd()));
  }
  return lines;
}

function cleanTitle(raw) {
  let t = (raw || "").trim();
  t = t.replace(/^contoh terisi\s*[—\-:]\s*/i, "");
  t = t.replace(/^["“”']+|["“”']+$/g, "");
  return t.trim();
}

function isInstructionOnly(line) {
  const l = line.trim();
  return l === "" || /^\[[^\]]*\]$/.test(l) || /^(isi konten|legend|template konten|sub-tab)\b/i.test(l);
}

function looksLikePlaceholderTitle(t) {
  return !t || /matching key|judul konten\]/i.test(t) || (t.startsWith("[") && t.endsWith("]"));
}

function trimBody(s) {
  return (s || "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * @param {import("googleapis").docs_v1.Schema$Document} doc
 * @returns {Array<{judul:string, utas1:string, utas2:string, reply:string}>}
 */
function parseContentDoc(doc) {
  const lines = extractLines(doc);
  const blocks = [];

  let cur = null; // { judul, fallbackJudul, utas1, utas2, reply }
  let section = null;
  let lastHeading = "";

  const hasBody = (b) => b && (b.utas1 || b.utas2 || b.reply);

  const flush = () => {
    if (cur) {
      const judul = cleanTitle(cur.judul || cur.fallbackJudul);
      if (!looksLikePlaceholderTitle(judul) && hasBody(cur)) {
        blocks.push({ judul, utas1: trimBody(cur.utas1), utas2: trimBody(cur.utas2), reply: trimBody(cur.reply) });
      }
    }
    cur = null;
    section = null;
  };

  const openBlock = (judul, fallbackJudul) => {
    flush();
    cur = { judul: judul || "", fallbackJudul: fallbackJudul || "", utas1: "", utas2: "", reply: "" };
    section = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    const jm = line.match(JUDUL_RE);
    if (jm) {
      openBlock(jm[1], "");
      continue;
    }

    const sec = matchSectionMarker(line);
    if (sec) {
      if (!cur || (sec === "utas1" && hasBody(cur))) {
        openBlock("", lastHeading);
      }
      section = sec;
      continue;
    }

    if (/akhir 1 blok konten|^—\s*akhir/i.test(line)) {
      flush();
      lastHeading = "";
      continue;
    }

    if (cur && section) {
      cur[section] += (cur[section] ? "\n" : "") + raw;
      continue;
    }

    if (!isInstructionOnly(line)) lastHeading = line;
  }

  flush();
  return blocks;
}

module.exports = { parseContentDoc, extractLines };
