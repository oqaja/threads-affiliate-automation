/**
 * generateFromBrief.js
 * Baca baris di tab "BRIEF PRODUK" yang "Status Brief" masih kosong, panggil
 * Gemini buat generate beberapa "angle" konten, lalu tulis tiap angle sebagai
 * baris baru di tab "JADWAL THREADS" (Tanggal Upload & Jam Threads dikosongin,
 * diisi manual; STATUS THREADS langsung "Acc").
 *
 * Baris brief yang sudah diproses ditandai Status Brief = "Diproses" biar
 * tidak digenerate ulang di run berikutnya. Kalau ada error di tengah proses
 * satu brief, Status Brief diset "Gagal" dan pesan error ditulis ke "Catatan
 * Brief" supaya kelihatan jelas (bukan dibiarkan kosong selamanya).
 *
 * Bisa ditarget ke satu baris brief spesifik lewat targetRowNumber (dipakai
 * trigger manual per-baris dari PWA) supaya tidak kena timeout kalau ada
 * banyak baris pending sekaligus. Tanpa targetRowNumber, tetap loop semua
 * baris yang Status Brief-nya kosong (dipakai script CLI).
 */

const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue, appendRow } = require("./sheetsHelper");
const { generateAnglesFromBrief, generateOneAngle, toCamelCase } = require("./geminiClient");
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

const CATATAN_MAX_LEN = 300;

/**
 * Ambil sampai N baris JADWAL THREADS terbaik di kategori yang sama, buat
 * dijadikan contoh few-shot ke Gemini. Skor = Views Utas 2 * 0.7 + Views
 * Utas 1 * 0.3. Cuma ambil baris yang punya data Views (minimal salah satu
 * Views Utas 1/2 terisi angka valid) DAN Kategori Produk-nya cocok persis.
 * Return array [{ utas1, utas2 }] — bisa kosong kalau belum ada data cukup
 * (generate tetap jalan normal tanpa contoh, bukan error).
 */
async function getTopPerformingExamples(sheets, kategori, limit = 3) {
  if (!kategori) return [];
  const { rows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );

  const scored = rows
    .filter((r) => String(r[C.KATEGORI] || "").trim() === kategori)
    .map((r) => {
      const v1 = Number(r[C.VIEWS_1]);
      const v2 = Number(r[C.VIEWS_2]);
      const hasData = (!isNaN(v1) && v1 > 0) || (!isNaN(v2) && v2 > 0);
      const score = (isNaN(v2) ? 0 : v2) * 0.7 + (isNaN(v1) ? 0 : v1) * 0.3;
      return { row: r, hasData, score };
    })
    .filter((x) => x.hasData)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((x) => ({
    utas1: String(x.row[C.UTAS1] || "").trim(),
    utas2: String(x.row[C.UTAS2] || "").trim(),
  })).filter((e) => e.utas1 && e.utas2);
}

/** Tulis 1 cell di tab "BRIEF PRODUK", skip kalau kolomnya tidak ada di header. */
async function writeBriefCell(sheets, briefHeaderMap, rowNumber, col, value) {
  const colNum = briefHeaderMap[col];
  if (!colNum) return;
  if (isDryRun()) {
    console.log(`    [DRY] Sheet r${rowNumber} "${col}" = ${JSON.stringify(String(value).slice(0, 90))}`);
    return;
  }
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME, rowNumber, colNum, value);
}

async function processOneBrief(briefRow, ctx) {
  try {
    await doProcessOneBrief(briefRow, ctx);
  } catch (err) {
    const { sheets, briefHeaderMap } = ctx;
    const pesan = String(err.message || "").slice(0, CATATAN_MAX_LEN);
    await writeBriefCell(sheets, briefHeaderMap, briefRow._rowNumber, BC.STATUS_BRIEF, CONFIG.BRIEF_STATUS.ERROR).catch(() => {});
    await writeBriefCell(sheets, briefHeaderMap, briefRow._rowNumber, BC.CATATAN, pesan).catch(() => {});
    throw err;
  }
}

async function doProcessOneBrief(briefRow, ctx) {
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

  const topExamples = await getTopPerformingExamples(sheets, kategori);
  console.log(`  (${topExamples.length} contoh top-performer dipakai sebagai referensi gaya)`);

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
    topExamples,
  });
  console.log(`     Gemini hasilkan ${angles.length} angle.`);

  const catatanLama = String(briefRow[BC.CATATAN] || "").trim();
  if (catatanLama) {
    await writeBriefCell(sheets, briefHeaderMap, briefRow._rowNumber, BC.CATATAN, "");
  }

  for (const angle of angles) {
    const rowValues = buildRowArray(jadwalHeaderMap, {
      [C.JUDUL]: judul,
      [C.BRAND]: brand,
      [C.LINK]: link,
      [C.KATEGORI]: kategori,
      [C.PILAR]: angle.pilar,
      [C.SEGMEN]: angle.segmen,
      [C.CATATAN_ANGLE]: angle.catatan_angle,
      [C.UTAS1]: angle.utas1,
      [C.UTAS2]: angle.utas2,
      [C.STATUS]: CONFIG.STATUS.READY,
    });
    if (isDryRun()) {
      console.log(`     [DRY] append row JADWAL THREADS: angle "${angle.catatan_angle}"`);
    } else {
      await appendRow(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowValues);
      console.log(`     OK append: angle "${angle.catatan_angle}"`);
    }
  }

  if (!briefHeaderMap[BC.STATUS_BRIEF]) {
    console.log(`  (warning) Kolom "Status Brief" tidak ketemu di header — brief ini AKAN diproses ulang run berikutnya.`);
    return;
  }
  await writeBriefCell(sheets, briefHeaderMap, briefRow._rowNumber, BC.STATUS_BRIEF, CONFIG.BRIEF_STATUS.DONE);
}

async function runGenerateFromBrief({ sheets, targetRowNumber }) {
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

  let target;
  if (targetRowNumber !== undefined) {
    target = briefRows.filter((r) => r._rowNumber === targetRowNumber);
    if (!target.length) {
      throw new Error(`Baris brief #${targetRowNumber} tidak ditemukan.`);
    }
    console.log(`Target 1 baris brief spesifik: #${targetRowNumber}.`);
  } else {
    target = briefRows.filter((r) => String(r[BC.STATUS_BRIEF] || "").trim() === "");
    console.log(`${briefRows.length} baris brief total — ${target.length} belum diproses (Status Brief kosong).`);
  }

  if (!target.length) {
    console.log("Tidak ada yang diproses run ini.");
    return;
  }

  const jadwalHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );

  for (const briefRow of target) {
    console.log(`Proses baris brief ${briefRow._rowNumber}: "${briefRow[BC.JUDUL]}"`);
    try {
      await processOneBrief(briefRow, { sheets, briefHeaderMap, jadwalHeaderMap });
    } catch (e) {
      console.log(`  GAGAL: ${e.message}`);
      console.log(`  (Status Brief = "${CONFIG.BRIEF_STATUS.ERROR}", Catatan Brief dicatat.)`);
    }
  }
  console.log("Selesai proses generate-from-brief.");
}

/**
 * Generate PERSIS 1 angle baru untuk brief tertentu, tulis langsung sebagai
 * baris baru ke JADWAL THREADS, return info progress. Idempoten secara
 * alami — dipanggil berkali-kali oleh client sampai currentCount mencapai
 * target (briefRow[BC.JUMLAH_ANGLE] atau default 4 kalau kosong).
 *
 * Return: { currentCount, target, finished, angle: {catatan_angle,...} }
 * currentCount = jumlah angle YANG SUDAH ADA untuk Judul Konten ini
 * (termasuk yang baru saja ditulis), dihitung dari JADWAL THREADS
 * (filter Judul Konten sama persis).
 */
async function generateOneAngleStep(briefRowNumber, ctx) {
  const { sheets } = ctx;

  const briefHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME, CONFIG.BRIEF_HEADER_ROW
  );
  const { rows: briefRows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME, CONFIG.BRIEF_HEADER_ROW
  );
  const briefRow = briefRows.find((r) => r._rowNumber === briefRowNumber);
  if (!briefRow) throw new Error(`Baris brief #${briefRowNumber} tidak ditemukan.`);

  const judul = String(briefRow[BC.JUDUL] || "").trim();
  const brand = String(briefRow[BC.BRAND] || "").trim();
  const link = String(briefRow[BC.LINK] || "").trim();
  if (!judul) throw new Error('"Judul Konten" kosong di baris brief ini.');
  if (!link) throw new Error('"Link Affiliate" kosong di baris brief ini.');

  const MAX_TARGET_ANGLE = 20;
  const rawTarget = Number(briefRow[BC.JUMLAH_ANGLE]);
  const target = rawTarget > 0 ? Math.floor(rawTarget) : 4; // default kalau kosong (Gemini tidak lagi bebas nentuin sendiri)
  if (target > MAX_TARGET_ANGLE) {
    throw new Error(
      `Jumlah Angle di baris brief ini (${target}) melebihi batas wajar ` +
      `(maks ${MAX_TARGET_ANGLE}). Cek dan perbaiki kolom "Jumlah Angle" ` +
      `di tab BRIEF PRODUK sebelum generate ulang.`
    );
  }

  const kategori = String(briefRow[BC.KATEGORI] || "").trim();
  const relevantFieldKeys = kategori
    ? CONFIG.CATEGORY_FIELDS[kategori] || CONFIG.CATEGORY_FIELDS["Lainnya"]
    : [];
  const categoryFields = {};
  for (const key of relevantFieldKeys) {
    categoryFields[toCamelCase(key)] = briefRow[BC[key]];
  }

  const jadwalHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );
  const { rows: jadwalRows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
  );
  const existingForJudul = jadwalRows.filter(
    (r) => String(r[C.JUDUL] || "").trim() === judul
  );
  const existingAngleSummaries = existingForJudul
    .map((r) => String(r[C.CATATAN_ANGLE] || "").trim())
    .filter(Boolean);

  if (existingForJudul.length >= target) {
    // Sudah cukup — tandai brief selesai kalau belum, jangan generate lagi.
    if (briefHeaderMap[BC.STATUS_BRIEF]) {
      if (isDryRun()) {
        console.log(`     [DRY] Brief r${briefRowNumber} "${BC.STATUS_BRIEF}" = "${CONFIG.BRIEF_STATUS.DONE}"`);
      } else {
        await setCellValue(
          sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME,
          briefRowNumber, briefHeaderMap[BC.STATUS_BRIEF], CONFIG.BRIEF_STATUS.DONE
        );
      }
    }
    return { currentCount: existingForJudul.length, target, finished: true, angle: null };
  }

  const topExamples = await getTopPerformingExamples(sheets, kategori);

  const angle = await generateOneAngle({
    brand,
    sellingPoint: briefRow[BC.SELLING_POINT],
    harga: briefRow[BC.HARGA],
    masalah: briefRow[BC.MASALAH],
    momen: briefRow[BC.MOMEN],
    kategori,
    categoryFields,
    topExamples,
    existingAngleSummaries,
  });

  const rowValues = buildRowArray(jadwalHeaderMap, {
    [C.JUDUL]: judul,
    [C.BRAND]: brand,
    [C.LINK]: link,
    [C.KATEGORI]: kategori,
    [C.PILAR]: angle.pilar,
    [C.SEGMEN]: angle.segmen,
    [C.CATATAN_ANGLE]: angle.catatan_angle,
    [C.UTAS1]: angle.utas1,
    [C.UTAS2]: angle.utas2,
    [C.STATUS]: CONFIG.STATUS.READY,
  });
  if (isDryRun()) {
    console.log(`     [DRY] append row JADWAL THREADS: angle "${angle.catatan_angle}"`);
  } else {
    await appendRow(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowValues);
  }

  // Di dry-run tetap dihitung +1 secara logika supaya progress counting bisa diamati.
  const newCount = existingForJudul.length + 1;
  const finished = newCount >= target;

  if (finished && briefHeaderMap[BC.STATUS_BRIEF]) {
    if (isDryRun()) {
      console.log(`     [DRY] Brief r${briefRowNumber} "${BC.STATUS_BRIEF}" = "${CONFIG.BRIEF_STATUS.DONE}"`);
    } else {
      await setCellValue(
        sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.BRIEF_SHEET_NAME,
        briefRowNumber, briefHeaderMap[BC.STATUS_BRIEF], CONFIG.BRIEF_STATUS.DONE
      );
    }
  }

  return { currentCount: newCount, target, finished, angle };
}

module.exports = {
  runGenerateFromBrief,
  processOneBrief,
  generateOneAngleStep,
  buildRowArray,
  getTopPerformingExamples,
};
