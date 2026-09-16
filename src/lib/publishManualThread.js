/**
 * publishManualThread.js
 * Publish konten "Manual": rantai utas dengan panjang bebas (bukan 3 post fix
 * seperti alur generate otomatis), tersimpan di tab "UTAS MANUAL". Satu ID
 * Konten = satu rantai utas, tiap baris di tab itu adalah 1 post berurutan
 * (kolom "Urutan"), reply berantai ke post sebelumnya.
 *
 * Baris "JADWAL THREADS" dengan Tipe Konten = "Manual" hanya berisi metadata
 * (Brand/Produk, Link Affiliate opsional, ID Konten) — teks & media tiap utas
 * ada di tab "UTAS MANUAL", dicocokkan lewat ID Konten.
 *
 * Idempoten: kolom "POST ID" per baris UTAS MANUAL dipakai sebagai penanda
 * baris itu sudah dipublish — retry berikutnya skip baris yang sudah selesai
 * dan lanjut dari yang belum.
 *
 * Error di tengah proses SENGAJA di-propagate ke pemanggil (tidak ditangani
 * di sini) — biar pemanggil yang set STATUS "Gagal" + Catatan, sama seperti
 * pola publishRow di publishThreads.js.
 */

const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue } = require("./sheetsHelper");
const { findFilesByExactNames, VIDEO_EXT } = require("./driveFinder");
const { isDryRun } = require("./env");
const { sleep } = require("./threadsClient");
// NB: require("./publishThreads") sengaja TIDAK di top-level — publishThreads.js
// juga require file ini (buat panggil publishManualThreadRow), jadi kalau
// didestructure di sini di top-level bakal kena circular-require dan dapat
// undefined. Di-require lazy di dalam function, dipanggil pas runtime setelah
// kedua modul selesai di-load.

const C = CONFIG.COL;
const MC = CONFIG.MANUAL_COL;
const S = CONFIG.STATUS;

async function writeManualCell(sheets, headerMap, rowNumber, col, value) {
  if (!headerMap[col]) return;
  if (isDryRun()) {
    console.log(`    [DRY] UTAS MANUAL r${rowNumber} "${col}" = ${JSON.stringify(String(value).slice(0, 90))}`);
    return;
  }
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.MANUAL_SHEET_NAME, rowNumber, headerMap[col], value);
}

/**
 * applyPlaceholders standar hanya replace [Link Affiliate] kalau link terisi
 * (link wajib di alur generate). Untuk manual, link opsional: kalau kosong,
 * placeholder itu (kalau ada di teks) di-replace jadi string kosong — bukan
 * dibiarkan literal.
 */
function applyManualPlaceholders(applyPlaceholders, text, { brand, link }) {
  let out = applyPlaceholders(text, { brand, link });
  if (!link) out = out.split(CONFIG.PLACEHOLDER.LINK).join("");
  return out.trim();
}

/**
 * Proses satu baris JADWAL THREADS bertipe "Manual": publish semua utas
 * terkait (tab UTAS MANUAL, dicocokkan lewat ID Konten) secara berurutan.
 */
async function publishManualThreadRow(jadwalRow, ctx) {
  const {
    applyPlaceholders,
    resolveLink,
    assertLen,
    writeCell,
    publishWithMedia,
    randomJedaMenit,
  } = require("./publishThreads");

  const { sheets, drive, threads, jadwalHeaderMap } = ctx;
  const jadwalRowNum = jadwalRow._rowNumber;

  const idKonten = String(jadwalRow[C.ID_KONTEN] || "").trim();
  if (!idKonten) {
    throw new Error("Baris manual ini tidak punya ID Konten.");
  }

  const manualHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.MANUAL_SHEET_NAME, CONFIG.MANUAL_HEADER_ROW
  );
  const { rows: manualRows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.MANUAL_SHEET_NAME, CONFIG.MANUAL_HEADER_ROW
  );

  const matched = manualRows.filter(
    (r) => String(r[MC.ID_KONTEN] || "").trim() === idKonten
  );
  if (!matched.length) {
    throw new Error("Tidak ada utas ditemukan untuk ID Konten ini di tab UTAS MANUAL.");
  }

  const utasRows = matched
    .map((row, origIdx) => {
      const raw = String(row[MC.URUTAN] || "").trim();
      const n = parseInt(raw, 10);
      const valid = raw !== "" && !isNaN(n);
      if (!valid) {
        console.log(`  WARNING: UTAS MANUAL r${row._rowNumber} (ID Konten ${idKonten}) tidak punya "Urutan" valid — ditaruh di akhir.`);
      }
      return { row, urutan: valid ? n : Infinity, origIdx };
    })
    .sort((a, b) => a.urutan - b.urutan || a.origIdx - b.origIdx)
    .map((x) => x.row);

  const brand = String(jadwalRow[C.BRAND] || "").trim();
  const link = resolveLink(jadwalRow);

  const setJadwal = (col, v) => writeCell(sheets, jadwalHeaderMap, jadwalRowNum, col, v);
  const setManual = (rowNum, col, v) => writeManualCell(sheets, manualHeaderMap, rowNum, col, v);

  let lastPostId;
  let successCount = 0;

  for (let i = 0; i < utasRows.length; i++) {
    const utasRow = utasRows[i];
    const utasRowNum = utasRow._rowNumber;
    let postId = String(utasRow[MC.POST_ID] || "").trim();

    if (postId) {
      console.log(`  (skip utas manual r${utasRowNum} — sudah ada POST ID ${postId})`);
      lastPostId = postId;
      successCount++;
      continue;
    }

    if (i > 0) {
      const jeda = randomJedaMenit();
      console.log(`  ... tunggu ${jeda.toFixed(1)} menit sebelum utas berikutnya`);
      if (!isDryRun()) await sleep(Math.round(jeda * 60 * 1000));
    }

    const text = applyManualPlaceholders(applyPlaceholders, utasRow[MC.TEKS], { brand, link });
    assertLen(`Utas manual r${utasRowNum} (ID Konten ${idKonten})`, text);

    const mediaRaw = String(utasRow[MC.MEDIA] || "").trim();
    const fileNames = mediaRaw
      ? mediaRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const foundFiles = fileNames.length ? await findFilesByExactNames(drive, fileNames) : [];
    const video = foundFiles.find((f) => VIDEO_EXT.test(f.name)) || null;
    const images = foundFiles.filter((f) => !VIDEO_EXT.test(f.name));

    const mediaLabel = [
      video ? "1 video" : null,
      images.length ? `${images.length} gambar` : null,
    ].filter(Boolean).join(" + ") || "tanpa media";
    console.log(`  -> Utas manual r${utasRowNum} (${i + 1}/${utasRows.length}, ${mediaLabel})`);

    postId = await publishWithMedia(threads, {
      text,
      video,
      images,
      replyToId: lastPostId,
    });
    await setManual(utasRowNum, MC.POST_ID, postId);
    console.log(`     OK POST ID = ${postId}`);

    lastPostId = postId;
    successCount++;
  }

  await setJadwal(C.STATUS, S.DONE);
  await setJadwal(
    C.CATATAN,
    `${S.DONE} ${new Date().toISOString()} — ${successCount} utas manual dipublish (ID Konten ${idKonten})`
  );
  console.log(`  SELESAI ID Konten ${idKonten} -> STATUS "${S.DONE}"`);
}

module.exports = {
  publishManualThreadRow,
};
