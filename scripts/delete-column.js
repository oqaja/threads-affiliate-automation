/**
 * delete-column.js — hapus 1 kolom dari tab tracker berdasarkan nama header (baris HEADER_ROW).
 *
 *   COL="UTM Link Affiliate" npm run delete-column
 *
 * Semua kolom setelahnya geser kiri. Aman buat kode ini (lookup pakai nama header,
 * bukan posisi).
 */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { getHeaderColumnMap, getSheetMeta, columnNumberToLetter } = require("../src/lib/sheetsHelper");

(async () => {
  assertCoreConfig();
  const col = process.env.COL || process.argv[2];
  if (!col) {
    console.error('Wajib: COL="nama header"');
    process.exit(1);
  }

  const { sheets } = await getGoogleAuthClients();
  const HR = CONFIG.HEADER_ROW;
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR);
  const colNum = headerMap[col];
  if (!colNum) {
    console.error(`Kolom "${col}" tidak ada. Yang ada: ${Object.keys(headerMap).join(", ")}`);
    process.exit(1);
  }

  const meta = await getSheetMeta(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME);
  if (!meta.exists) {
    console.error(`Tab "${CONFIG.SHEET_NAME}" tidak ada.`);
    process.exit(1);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId: meta.sheetId, dimension: "COLUMNS", startIndex: colNum - 1, endIndex: colNum },
          },
        },
      ],
    },
  });

  console.log(`OK  kolom "${col}" (${columnNumberToLetter(colNum)}) dihapus dari "${CONFIG.SHEET_NAME}".`);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
