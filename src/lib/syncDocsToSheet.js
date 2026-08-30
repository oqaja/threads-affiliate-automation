/**
 * syncDocsToSheet.js
 * Google Doc (sumber utama) -> Google Sheet (tracker).
 *
 * - Baris di-match berdasarkan "Judul Konten".
 * - Hanya kolom "sync dari Docs" yang ditulis: Judul, Tanggal Upload, Pilar,
 *   Brand/Produk, Brand Referensi, Jam Threads, Link Affiliate.
 * - Kolom manual (STATUS THREADS, Jeda Utas 2) dan kolom hasil (POST ID, Views)
 *   TIDAK pernah disentuh di sini.
 * - Baris baru di-append dengan STATUS kosong -> nunggu approval manual jadi "Acc".
 */

const { CONFIG } = require("./config");
const { parseContentDoc } = require("./docsReader");
const {
  readSheetAsObjects,
  getHeaderColumnMap,
  ensureSheetWithHeaders,
  setCellValue,
  appendRow,
} = require("./sheetsHelper");

const C = CONFIG.COL;

const SHEET_HEADERS = [
  C.JUDUL, C.TANGGAL, C.PILAR, C.BRAND, C.BRAND_REF, C.JAM, C.LINK, C.UTM,
  C.STATUS, C.JEDA_UTAS2,
  C.POST_ID_1, C.POST_ID_2, C.POST_ID_REPLY,
  C.VIEWS_1, C.VIEWS_2, C.REPLY_RATE,
  CONFIG.COL_INTERNAL.TS_UTAS1,
  C.CATATAN,
];

// field blok Docs -> nama kolom Sheet (hanya yang di-sync)
const SYNC_MAP = {
  [C.JUDUL]: "judul",
  [C.TANGGAL]: "tanggalUpload",
  [C.PILAR]: "pilar",
  [C.BRAND]: "brand",
  [C.BRAND_REF]: "brandReferensi",
  [C.JAM]: "jamThreads",
  [C.LINK]: "linkAffiliate",
};

function normKey(s) {
  return String(s || "").trim().toLowerCase();
}

async function runSync({ sheets, docs }) {
  const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
  const blocks = parseContentDoc(doc);
  console.log(`Doc parsed: ${blocks.length} blok konten valid.`);
  if (!blocks.length) {
    console.log("Tidak ada blok konten. Selesai.");
    return { appended: 0, updated: 0 };
  }

  await ensureSheetWithHeaders(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, SHEET_HEADERS);
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME);
  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME);

  const byJudul = new Map();
  for (const r of rows) byJudul.set(normKey(r[C.JUDUL]), r);

  let appended = 0;
  let updated = 0;

  for (const b of blocks) {
    const existing = byJudul.get(normKey(b.judul));

    if (!existing) {
      const rowValues = SHEET_HEADERS.map((h) => {
        const field = SYNC_MAP[h];
        return field ? b[field] || "" : "";
      });
      await appendRow(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowValues);
      appended++;
      console.log(`  + append: ${b.judul}`);
      continue;
    }

    // Update hanya kolom sync yang isinya beda.
    let changedFields = 0;
    for (const [col, field] of Object.entries(SYNC_MAP)) {
      const newVal = String(b[field] || "").trim();
      const oldVal = String(existing[col] || "").trim();
      if (newVal !== "" && newVal !== oldVal && headerMap[col]) {
        await setCellValue(
          sheets,
          CONFIG.TRACKER_SPREADSHEET_ID,
          CONFIG.SHEET_NAME,
          existing._rowNumber,
          headerMap[col],
          newVal
        );
        changedFields++;
      }
    }
    if (changedFields) {
      updated++;
      console.log(`  ~ update (${changedFields} field): ${b.judul}`);
    }
  }

  console.log(`Sync selesai. Append: ${appended}, update: ${updated}.`);
  return { appended, updated };
}

module.exports = { runSync, SHEET_HEADERS };
