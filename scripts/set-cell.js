/**
 * set-cell.js — set 1 sel di tracker berdasarkan Judul Konten + nama kolom.
 * Buat maintenance manual (mis. ubah "Jeda Utas 2 (menit)", reset STATUS, dll).
 *
 *   JUDUL="Samba Look Lokal Ver" COL="Jeda Utas 2 (menit)" VALUE=5 npm run set-cell
 *
 * VALUE boleh string kosong ("") untuk mengosongkan sel.
 */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const {
  readSheetAsObjects,
  getHeaderColumnMap,
  setCellValue,
  columnNumberToLetter,
} = require("../src/lib/sheetsHelper");

const normKey = (s) => String(s || "").trim().toLowerCase();

(async () => {
  assertCoreConfig();
  const judul = process.env.JUDUL || process.argv[2];
  const col = process.env.COL || process.argv[3];
  const value = process.env.VALUE ?? process.argv[4] ?? "";
  if (!judul || !col) {
    console.error('Wajib: JUDUL="..." COL="..." VALUE=...');
    process.exit(1);
  }

  const { sheets } = await getGoogleAuthClients();
  const HR = CONFIG.HEADER_ROW;
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR);
  if (!headerMap[col]) {
    console.error(`Kolom "${col}" tidak ada. Kolom yang ada: ${Object.keys(headerMap).join(", ")}`);
    process.exit(1);
  }

  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR);
  const row = rows.find((r) => normKey(r[CONFIG.COL.JUDUL]) === normKey(judul));
  if (!row) {
    console.error(`Judul "${judul}" tidak ketemu di tracker.`);
    process.exit(1);
  }

  const before = row[col];
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, row._rowNumber, headerMap[col], value);
  const cell = `${columnNumberToLetter(headerMap[col])}${row._rowNumber}`;
  console.log(`OK  "${judul}"  ${cell} ("${col}"):  ${JSON.stringify(before)} -> ${JSON.stringify(value)}`);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
