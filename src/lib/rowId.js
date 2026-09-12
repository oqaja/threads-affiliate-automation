/**
 * rowId.js
 * Pastikan tiap baris di tab "JADWAL THREADS" punya "Row ID" unik & permanen.
 *
 * Dipakai sebagai subId2 saat nge-tag Link Affiliate (Shopee Affiliate conversion
 * tracking) — bukan _rowNumber, karena _rowNumber bisa geser kalau ada baris
 * disisip/dihapus. Sekali digenerate, Row ID TIDAK PERNAH diubah lagi.
 */

const crypto = require("crypto");
const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue, invalidateHeaderMapCache } = require("./sheetsHelper");

const C = CONFIG.COL;

function generateRowId(existing) {
  let id;
  do {
    id = crypto.randomBytes(4).toString("hex"); // 8 hex char, cukup buat volume konten personal
  } while (existing.has(id));
  return id;
}

/**
 * Tambah kolom "Row ID" ke header (kalau belum ada) + isi Row ID baru buat
 * baris yang masih kosong. Return jumlah baris yang baru diisi.
 */
async function ensureRowIds({ sheets }) {
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);

  if (!headerMap[C.ROW_ID]) {
    const maxCol = Math.max(0, ...Object.values(headerMap));
    await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW, maxCol + 1, C.ROW_ID);
    invalidateHeaderMapCache(CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME);
    console.log(`  Kolom "${C.ROW_ID}" ditambahkan di header baris ${CONFIG.HEADER_ROW}.`);
  }

  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);
  const existing = new Set(rows.map((r) => String(r[C.ROW_ID] || "").trim()).filter(Boolean));

  const freshHeaderMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);
  const colNum = freshHeaderMap[C.ROW_ID];

  let filled = 0;
  for (const row of rows) {
    if (String(row[C.ROW_ID] || "").trim()) continue;
    const id = generateRowId(existing);
    existing.add(id);
    await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, row._rowNumber, colNum, id);
    console.log(`  Row ID "${id}" -> baris ${row._rowNumber} ("${row[C.JUDUL] || ""}")`);
    filled++;
  }
  return filled;
}

module.exports = { ensureRowIds, generateRowId };
