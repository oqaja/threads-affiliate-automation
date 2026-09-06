/**
 * preview.js — tampilkan persis apa yang AKAN diposting untuk tiap baris "Acc".
 * Tidak posting, tidak nulis apa pun. Semua teks dibaca dari kolom Sheet.
 *
 *   npm run preview
 */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { readSheetAsObjects } = require("../src/lib/sheetsHelper");
const { findImagesForTitle } = require("../src/lib/driveFinder");
const { applyPlaceholders, resolveLink, jamDisplay, jamThreadsPassed } = require("../src/lib/publishThreads");

const C = CONFIG.COL;
const S = CONFIG.STATUS;

function box(label, text) {
  const len = [...text].length;
  const flag = len > CONFIG.THREADS_MAX_TEXT ? `  ⚠️ ${len}/${CONFIG.THREADS_MAX_TEXT}` : `  (${len} char)`;
  console.log(`\n  ┌─ ${label}${flag}`);
  text.split("\n").forEach((l) => console.log(`  │ ${l}`));
  console.log(`  └─`);
}

(async () => {
  assertCoreConfig();
  const { sheets, drive } = await getGoogleAuthClients();

  const { headers, rows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );
  const need = [C.JUDUL, C.STATUS, C.UTAS1, C.UTAS2, C.REPLY, C.LINK];
  const missing = need.filter((c) => !headers.includes(c));
  if (missing.length) {
    console.log(`✗ Kolom wajib hilang di header baris ${CONFIG.HEADER_ROW}: ${missing.join(", ")}`);
    process.exit(1);
  }

  const todo = rows.filter((r) => String(r[C.STATUS] || "").trim().toLowerCase() === S.READY.toLowerCase());
  console.log(`=== PREVIEW — ${todo.length} baris "Acc" ===`);

  for (const row of todo) {
    const judul = String(row[C.JUDUL] || "").trim();
    const brand = String(row[C.BRAND] || "").trim();
    const link = resolveLink(row);
    const jam = jamDisplay(row[C.JAM]);
    const jeda = Number(row[C.JEDA_UTAS2]) || CONFIG.DEFAULT_JEDA_UTAS2_MENIT;
    const images = await findImagesForTitle(drive, judul).catch(() => []);
    const passed = jamThreadsPassed(row[C.JAM]);

    console.log(`\n\n### ${judul}   [baris ${row._rowNumber}]`);
    console.log(`  brand=${brand || "-"}  jam=${jam} ${passed ? "(sudah lewat)" : "(BELUM — nunggu)"}  jeda Utas2=${jeda}m  link=${link || "-"}`);
    if (!brand) console.log(`  ! Brand/Produk kosong — "[Brand/Produk]" tidak akan ke-replace`);
    if (!link) console.log(`  ! Link Affiliate kosong — reply link akan GAGAL`);

    box("UTAS 1 (hook, text)", applyPlaceholders(row[C.UTAS1], { brand, link }));
    const imgNote = images.length
      ? `${images.length} gambar: ${images.map((i) => i.name).join(", ")}${images.length >= 2 ? " (carousel)" : ""}`
      : "0 gambar → text-only";
    box(`UTAS 2 (produk) — ${imgNote}`, applyPlaceholders(row[C.UTAS2], { brand, link }));
    box("REPLY (link)", applyPlaceholders(row[C.REPLY], { brand, link }));
  }
  console.log("\n=== selesai preview (tidak ada yang diposting) ===");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
