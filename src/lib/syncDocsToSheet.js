/**
 * syncDocsToSheet.js
 * Google Doc (teks konten) -> pastikan tiap "JUDUL:" punya 1 baris di tracker Sheet.
 *
 * - Match berdasarkan "Judul Konten" (kolom di header baris 3).
 * - Kalau judul dari Doc belum ada di Sheet -> append baris baru, isi cuma
 *   kolom "Judul Konten". STATUS dibiarkan kosong -> nunggu approval manual jadi "Acc".
 * - Metadata (Pilar, Brand, Link, Jam, dst) TIDAK disentuh — itu diisi manual di Sheet.
 * - Kolom hasil (POST ID, Views) juga tidak disentuh.
 */

const { CONFIG } = require("./config");
const { parseContentDoc } = require("./docsReader");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue } = require("./sheetsHelper");
const { isDryRun } = require("./env");

const C = CONFIG.COL;
const HR = CONFIG.HEADER_ROW;

const normKey = (s) => String(s || "").trim().toLowerCase();

async function runSync({ sheets, docs }) {
  const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
  const blocks = parseContentDoc(doc);
  console.log(`Doc "${doc.title}": ${blocks.length} blok konten valid.`);
  if (!blocks.length) return { appended: 0 };

  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR);
  const judulCol = headerMap[C.JUDUL];
  if (!judulCol) throw new Error(`Kolom "${C.JUDUL}" tidak ada di header baris ${HR}.`);

  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR);
  const known = new Set(rows.map((r) => normKey(r[C.JUDUL])));
  let nextRow = HR + rows.length + 1;

  const dry = isDryRun();
  let appended = 0;

  for (const b of blocks) {
    if (known.has(normKey(b.judul))) continue;
    if (dry) {
      console.log(`  [DRY] append baris ${nextRow}: "${b.judul}" (kolom ${C.JUDUL})`);
    } else {
      await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, nextRow, judulCol, b.judul);
      console.log(`  + baris ${nextRow}: "${b.judul}"`);
    }
    known.add(normKey(b.judul));
    nextRow++;
    appended++;
  }

  console.log(`Sync selesai. ${appended} judul baru ditambahkan.`);
  return { appended };
}

module.exports = { runSync };
