/**
 * generateFromBrief.js
 * Baca baris di tab "BRIEF PRODUK" yang "Status Brief" masih kosong, panggil
 * Gemini buat generate beberapa "angle" konten, lalu tulis tiap angle sebagai
 * baris baru di tab "JADWAL THREADS" (Tanggal Upload & Jam Threads dikosongin,
 * diisi manual; STATUS THREADS langsung "Acc").
 *
 * Baris brief yang sudah diproses ditandai Status Brief = "Diproses" biar
 * tidak digenerate ulang di run berikutnya. Kalau ada error di tengah proses
 * satu brief, Status Brief-nya SENGAJA dibiarkan kosong supaya dicoba lagi
 * run berikutnya (bukan silent-skip).
 */

const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue, appendRow } = require("./sheetsHelper");
const { generateAnglesFromBrief, toCamelCase } = require("./geminiClient");
const { isDryRun } = require("./env");

const BC = CONFIG.BRIEF_COL;
const C = CONFIG.COL;

/** Bangun array row sepanjang jumlah kolom di headerMap, isi berdasar nama kolom -> value. */
function buildRowArray(headerMap, valuesByColName) {
  const maxCol = Math.max(0, ...Object.values(headerMap));
  const arr = new Array(maxCol).fill("");
  for (const [colName, value] of Object.entries(valuesByColName)) {
    const colNum = headerMap[colName];
    if (colNum) arr[colNum - 1] = value;
  }
  return arr;
}

async function processOneBrief(briefRow, ctx) {
  const { sheets, briefHeaderMap, jadwalHeaderMap } = ctx;
  const judul = String(briefRow[BC.JUDUL] || "").trim();
  const brand = String(briefRow[BC.BRAND] || "").trim();
  const link = String(briefRow[BC.LINK] || "").trim();

  if (!judul) throw new Error('"Judul Konten" kosong di baris brief ini.');
  if (!link) throw new Error('"Link Affiliate" kosong di baris brief ini.');

  const kategori = String(briefRow[BC.KATEGORI] || "").trim();
  const relevantFieldKeys = kategori
    ? CONFIG.CATEGORY_FIELDS[kategori] || CONFIG.CATEGORY_FIELDS["Lainnya"]
    : [];
  const categoryFields = {};
  for (const key of relevantFieldKeys) {
    categoryFields[toCamelCase(key)] = briefRow[BC[key]];
  }

  console.log(`  -> Generate angle buat: "${judul}"`);
  const angles = await generateAnglesFromBrief({
    brand,
    jumlahAngle: briefRow[BC.JUMLAH_ANGLE],
    sellingPoint: briefRow[BC.SELLING_POINT],
    harga: briefRow[BC.HARGA],
    masalah: briefRow[BC.MASALAH],
    momen: briefRow[BC.MOMEN],
    kategori,
    categoryFields,
  });
  console.log(`     Gemini hasilkan ${angles.length} angle.`);

  for (const angle of angles) {
    const rowValues = buildRowArray(jadwalHeaderMap, {
      [C.JUDUL]: judul,
      [C.BRAND]: brand,
      [C.LINK]: link,
      [C.PILAR]: angle.pilar,
      [C.SEGMEN]: angle.segmen,
      [C.CATATAN_ANGLE]: angle.catatan_angle,
      [C.UTAS1]: angle.utas1,
      [C.UTAS2]: angle.utas2,
      [C.REPLY]: angle.reply,
      [C.STATUS]: CONFIG.STATUS.READY,
    });
    if (isDryRun()) {
      console.log(`     [DRY] append row JADWAL THREADS: angle "${angle.catatan_angle}"`);
    } else {
      await appendRow(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowValues);
      console.log(`     OK append: angle "${angle.catatan_angle}"`);
    }
  }

  const statusColNum = briefHeaderMap[BC.STATUS_BRIEF];
  if (!statusColNum) {
    console.log(`  (warning) Kolom "Status Brief" tidak ketemu di header — brief ini AKAN diproses ulang run berikutnya.`);
    return;
  }
  if (isDryRun()) {
    console.log(`  [DRY] Status Brief r${briefRow._rowNumber} = "${CONFIG.BRIEF_STATUS.DONE}"`);
  } else {
    await setCellValue(
      sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME,
      briefRow._rowNumber, statusColNum, CONFIG.BRIEF_STATUS.DONE
    );
  }
}

async function runGenerateFromBrief({ sheets }) {
  const briefHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME, CONFIG.BRIEF_HEADER_ROW
  );
  const { headers: briefHeaders, rows: briefRows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME, CONFIG.BRIEF_HEADER_ROW
  );

  const need = [BC.JUDUL, BC.LINK, BC.STATUS_BRIEF];
  const missing = need.filter((c) => !briefHeaders.includes(c));
  if (missing.length) {
    throw new Error(`Kolom wajib tidak ada di header "${CONFIG.BRIEF_SHEET_NAME}" baris ${CONFIG.BRIEF_HEADER_ROW}: ${missing.join(", ")}`);
  }

  const pending = briefRows.filter((r) => String(r[BC.STATUS_BRIEF] || "").trim() === "");
  console.log(`${briefRows.length} baris brief total — ${pending.length} belum diproses (Status Brief kosong).`);
  if (!pending.length) {
    console.log("Tidak ada yang diproses run ini.");
    return;
  }

  const jadwalHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );

  for (const briefRow of pending) {
    console.log(`Proses baris brief ${briefRow._rowNumber}: "${briefRow[BC.JUDUL]}"`);
    try {
      await processOneBrief(briefRow, { sheets, briefHeaderMap, jadwalHeaderMap });
    } catch (e) {
      console.log(`  GAGAL: ${e.message}`);
      console.log(`  (Status Brief dibiarkan kosong, akan dicoba lagi run berikutnya.)`);
    }
  }
  console.log("Selesai proses generate-from-brief.");
}

module.exports = { runGenerateFromBrief, processOneBrief, buildRowArray };
