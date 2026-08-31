/**
 * preview.js — tampilkan persis apa yang AKAN diposting untuk tiap baris actionable.
 * Tidak posting, tidak nulis apa pun.
 *
 *   npm run preview
 */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { parseContentDoc } = require("../src/lib/docsReader");
const { readSheetAsObjects } = require("../src/lib/sheetsHelper");
const { findImagesForTitle } = require("../src/lib/driveFinder");
const { applyPlaceholders, resolveLink } = require("../src/lib/publishThreads");

const C = CONFIG.COL;
const S = CONFIG.STATUS;
const normKey = (s) => String(s || "").trim().toLowerCase();

function box(label, text) {
  const len = [...text].length;
  const flag = len > CONFIG.THREADS_MAX_TEXT ? `  ⚠️ ${len}/${CONFIG.THREADS_MAX_TEXT}` : `  (${len} char)`;
  console.log(`\n  ┌─ ${label}${flag}`);
  text.split("\n").forEach((l) => console.log(`  │ ${l}`));
  console.log(`  └─`);
}

(async () => {
  assertCoreConfig();
  const { sheets, drive, docs } = await getGoogleAuthClients();

  const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
  const blocks = new Map(parseContentDoc(doc).map((b) => [normKey(b.judul), b]));

  const { rows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );
  const actionable = new Set([S.READY, S.UTAS1_DONE, S.UTAS2_DONE]);
  const todo = rows.filter((r) => actionable.has(String(r[C.STATUS] || "").trim()));

  console.log(`=== PREVIEW — ${todo.length} baris actionable ===`);
  for (const row of todo) {
    const judul = String(row[C.JUDUL] || "").trim();
    const block = blocks.get(normKey(judul));
    console.log(`\n\n### ${judul}   [STATUS: ${row[C.STATUS]}]`);
    if (!block) {
      console.log(`  ✗ tidak ada blok "JUDUL: ${judul}" di Doc — baris ini akan di-skip.`);
      continue;
    }
    const brand = String(row[C.BRAND] || "").trim();
    const link = resolveLink(row);
    const jam = String(row[C.JAM] || "").trim();
    const jeda = Number(row[C.JEDA_UTAS2]) || CONFIG.DEFAULT_JEDA_UTAS2_MENIT;
    const images = await findImagesForTitle(drive, judul).catch(() => []);

    console.log(`  brand=${brand || "-"}  jam=${jam || "(langsung)"}  jeda Utas2=${jeda}m  link=${link || "-"}`);
    if (!brand) console.log(`  ! Brand/Produk kosong — "[Brand/Produk]" tidak akan ke-replace`);
    if (!link) console.log(`  ! Link Affiliate kosong — reply link akan GAGAL`);

    box("UTAS 1 (hook, text)", applyPlaceholders(block.utas1, { brand }));
    const imgNote = images.length
      ? `${images.length} gambar: ${images.map((i) => i.name).join(", ")}${images.length >= 2 ? " (carousel)" : ""}`
      : "0 gambar → text-only";
    box(`UTAS 2 (produk) — ${imgNote}`, applyPlaceholders(block.utas2, { brand }));
    box("REPLY (link)", applyPlaceholders(block.reply, { brand, link }));
  }
  console.log("\n=== selesai preview (tidak ada yang diposting) ===");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
