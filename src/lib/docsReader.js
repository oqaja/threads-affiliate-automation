/**
 * docsReader.js
 * Baca Google Doc "Template Konten Threads Affiliate" dan pecah jadi array blok konten.
 * Satu blok = satu konten Threads (metadata + isi Utas 1 / Utas 2 / Reply).
 *
 * Format yang diharapkan (lihat Template_Konten_Threads_Affiliate_v2.docx):
 *
 *   Tanggal Upload
 *   05/09/2026
 *   Judul Konten
 *   Samba Look Lokal Ver
 *   Pilar
 *   Myth-busting
 *   ...
 *   --- UTAS 1 (Hook) ---
 *   <teks hook, boleh multi-paragraf>
 *   --- UTAS 2 (Produk) ---
 *   <teks produk>
 *   --- REPLY (Link) ---
 *   <teks reply + [Link Affiliate]>
 */

// Label metadata yang berdiri sendiri di satu baris, value-nya di baris berikutnya.
const META_LABELS = {
  "tanggal upload": "tanggalUpload",
  "judul konten": "judul",
  pilar: "pilar",
  segmen: "segmen",
  "brand/produk": "brand",
  "brand referensi": "brandReferensi",
  "link affiliate": "linkAffiliate",
  "jam threads": "jamThreads",
  "catatan angle": "catatanAngle",
};

const SECTION_MARKERS = [
  { test: /^-{2,}\s*utas\s*1/i, key: "utas1" },
  { test: /^-{2,}\s*utas\s*2/i, key: "utas2" },
  { test: /^-{2,}\s*reply/i, key: "reply" },
];

function isBlockStart(line) {
  const l = line.trim().toLowerCase();
  return l === "tanggal upload" || l === "judul konten";
}

function isBlockEnd(line) {
  return /akhir 1 blok konten|—\s*akhir/i.test(line);
}

function matchSectionMarker(line) {
  const trimmed = line.trim();
  for (const m of SECTION_MARKERS) {
    if (m.test.test(trimmed)) return m.key;
  }
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
    // Google Docs pakai \v (vertical tab) untuk soft line break dalam satu paragraf.
    text.split(/[\n\v]/).forEach((p) => lines.push(p.trimEnd()));
  }
  return lines;
}

function looksLikePlaceholder(value) {
  const v = (value || "").trim();
  if (!v) return true;
  if (v.startsWith("[") && v.endsWith("]")) return true;
  if (/matching key|dd\/mm\/yyyy|nama brand lokal|isi teks|freeform/i.test(v)) return true;
  return false;
}

function finalizeBlock(block) {
  if (!block) return null;
  const judul = (block.judul || "").trim();
  if (looksLikePlaceholder(judul)) return null;

  const trimMulti = (s) => (s || "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    judul,
    tanggalUpload: (block.tanggalUpload || "").trim(),
    pilar: (block.pilar || "").trim(),
    segmen: (block.segmen || "").trim(),
    brand: (block.brand || "").trim(),
    brandReferensi: (block.brandReferensi || "").trim(),
    linkAffiliate: (block.linkAffiliate || "").trim(),
    jamThreads: (block.jamThreads || "").trim(),
    catatanAngle: (block.catatanAngle || "").trim(),
    utas1: trimMulti(block.utas1),
    utas2: trimMulti(block.utas2),
    reply: trimMulti(block.reply),
  };
}

/**
 * @param {import("googleapis").docs_v1.Schema$Document} doc
 * @returns {Array<object>} daftar blok konten valid
 */
function parseContentDoc(doc) {
  const lines = extractLines(doc);
  const blocks = [];

  let block = null;
  let mode = null; // null | "meta" | "section"
  let pendingField = null;

  const pushBlock = () => {
    const done = finalizeBlock(block);
    if (done) blocks.push(done);
    block = null;
    mode = null;
    pendingField = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (isBlockEnd(line)) {
      pushBlock();
      continue;
    }

    if (isBlockStart(line)) {
      if (block && (block.judul || block.utas1 || block.utas2)) pushBlock();
      if (!block) block = {};
      pendingField = META_LABELS[line.toLowerCase()];
      mode = "meta";
      continue;
    }

    const sectionKey = matchSectionMarker(line);
    if (sectionKey) {
      if (!block) block = {};
      mode = "section";
      pendingField = sectionKey;
      block[sectionKey] = block[sectionKey] || "";
      continue;
    }

    const metaField = META_LABELS[line.toLowerCase()];
    if (metaField && block && mode !== "section") {
      pendingField = metaField;
      mode = "meta";
      continue;
    }

    if (!block) continue; // masih di bagian instruksi/legend sebelum blok pertama

    if (mode === "meta" && pendingField) {
      if (line === "") continue;
      block[pendingField] = line;
      pendingField = null;
      mode = null;
      continue;
    }

    if (mode === "section" && pendingField) {
      block[pendingField] += (block[pendingField] ? "\n" : "") + raw;
      continue;
    }
  }

  pushBlock();
  return blocks;
}

module.exports = { parseContentDoc, extractLines };
