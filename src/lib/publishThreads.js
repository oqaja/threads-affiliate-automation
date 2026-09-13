/**
 * publishThreads.js
 * Publish 1 konten = 3 post berantai di Threads. SEMUA teks diambil langsung
 * dari kolom Sheet di baris yang sama:
 *
 *   "Utas 1 (Hook)"  -> post text                    (Utas 1)
 *   "Utas 2 (Produk)" -> post + gambar Drive, reply ke Utas 1   (Utas 2)
 *   "Reply (Link)"   -> post text, reply ke Utas 2   (Reply link)
 *
 * Alur:
 *   STATUS "Acc" + (Jam Threads sudah lewat)  ->  post 3 utas berantai  ->  STATUS "Uploaded"
 *   error di step mana pun                     ->  STATUS "Gagal" + Catatan
 *
 * Jeda Utas 1 -> Utas 2 = acak 1-2 menit per-run (CONFIG.JEDA_UTAS2_MIN/MAX_MENIT),
 * pakai sleep dalam proses. Kolom Sheet "Jeda Utas 2 (menit)" tidak dipakai lagi.
 * Satu run memproses SATU baris (biar durasi job terbatas & rapi buat rate limit);
 * baris berikutnya diproses run cron selanjutnya.
 *
 * Placeholder yang di-replace runtime: [Brand/Produk] -> kolom Brand/Produk,
 * [Link Affiliate] -> kolom Link Affiliate (apa adanya).
 */

const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue } = require("./sheetsHelper");
const { getDatePartsInTimezone, tanggalUploadDue } = 
require("./dateUtils");
const { findImagesForTitle, findVideoForTitle } = require("./driveFinder");
const { isDryRun } = require("./env");
const { sleep } = require("./threadsClient");

const C = CONFIG.COL;
const S = CONFIG.STATUS;
const HR = CONFIG.HEADER_ROW;

/**
 * "Jam Threads" -> menit dalam sehari (WIB). Terima:
 *   - number 0..1  : serial waktu Google Sheets (0.7916.. = 19:00)
 *   - "19:00" / "19.00" : string jam
 * null kalau kosong / tidak valid.
 */
function jamToMinutes(jamCell) {
  if (jamCell === "" || jamCell == null) return null;
  if (typeof jamCell === "number" && !isNaN(jamCell) && jamCell > 0 && jamCell < 1) {
    return Math.round(jamCell * 24 * 60);
  }
  const raw = String(jamCell).trim();
  if (/^0?\.\d+$/.test(raw)) return Math.round(parseFloat(raw) * 24 * 60); // "0.79166"
  const m = raw.replace(".", ":").match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Jam Threads sudah lewat belum untuk hari ini (WIB)? Kosong/invalid = anggap sudah. */
function jamThreadsPassed(jamCell) {
  const target = jamToMinutes(jamCell);
  if (target == null) return true;
  const now = getDatePartsInTimezone(new Date(), CONFIG.TIMEZONE);
  return now.hour * 60 + now.minute >= target;
}

/** "19:00" buat ditampilkan (dari cell apa pun bentuknya). */
function jamDisplay(jamCell) {
  const t = jamToMinutes(jamCell);
  if (t == null) return "(langsung)";
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Buang baris instruksi template, mis:
 *   [Isi teks hook di sini.]
 *   [script otomatis replace "[Brand/Produk]" pakai isi field Brand/Produk di atas]
 * Baris dianggap instruksi kalau seluruhnya dibungkus kurung siku ATAU mengandung
 * frasa "script ... replace".
 */
function stripInstructionLines(text) {
  return String(text || "")
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (/^\[.*\]$/.test(l)) return false;
      if (/script\s+(otomatis|auto)?\s*-?\s*replace/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Link yang dipakai = isi kolom "Link Affiliate" apa adanya (tanpa tambahan UTM). */
function resolveLink(row) {
  return String(row[C.LINK] || "").trim();
}

function applyPlaceholders(text, { brand, link }) {
  // Substitusi placeholder DULU, baru buang baris instruksi — supaya baris konten
  // yang kebetulan diapit "[Brand/Produk] ... [Link Affiliate]" tidak ikut kebuang.
  let out = String(text || "");
  if (brand) out = out.split(CONFIG.PLACEHOLDER.BRAND).join(brand);
  if (link) out = out.split(CONFIG.PLACEHOLDER.LINK).join(link);
  out = stripInstructionLines(out);
  return out.trim();
}

function assertLen(label, text) {
  if (!text) throw new Error(`${label} kosong (cek kolom di Sheet).`);
  if (text.length > CONFIG.THREADS_MAX_TEXT) {
    throw new Error(`${label} ${text.length} karakter, lewat batas ${CONFIG.THREADS_MAX_TEXT}. Pendekin di Sheet.`);
  }
}

/** Jeda Utas 1 -> Utas 2 (menit): acak per-run antara MIN & MAX. Bisa pecahan. */
function randomJedaMenit() {
  const lo = CONFIG.JEDA_UTAS2_MIN_MENIT;
  const hi = CONFIG.JEDA_UTAS2_MAX_MENIT;
  return lo + Math.random() * (hi - lo);
}

/** Fisher-Yates shuffle — tidak memodifikasi array asli, return array baru. */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function writeCell(sheets, headerMap, rowNumber, col, value) {
  if (!headerMap[col]) return;
  if (isDryRun()) {
    console.log(`    [DRY] Sheet r${rowNumber} "${col}" = ${JSON.stringify(String(value).slice(0, 90))}`);
    return;
  }
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowNumber, headerMap[col], value);
}

/** Publish 1 post text-only (Utas 1 / Reply). */
async function publishText(threads, { text, replyToId }) {
  const creationId = await threads.createContainer({ mediaType: "TEXT", text, replyToId });
  await threads.waitUntilFinished(creationId);
  return threads.publishContainer(creationId);
}

/** Publish 1 post dengan video opsional + 0..n gambar (Utas 2). */
async function publishWithMedia(threads, { text, video, images, replyToId }) {
  const items = [];
  if (video) items.push({ type: "VIDEO", url: video.url });
  for (const img of images) items.push({ type: "IMAGE", url: img.url });

  if (items.length === 0) {
    return publishText(threads, { text, replyToId });
  }
  if (items.length === 1) {
    const item = items[0];
    const creationId = await threads.createContainer({
      mediaType: item.type,
      text,
      imageUrl: item.type === "IMAGE" ? item.url : undefined,
      videoUrl: item.type === "VIDEO" ? item.url : undefined,
      replyToId,
    });
    await threads.waitUntilFinished(creationId);
    return threads.publishContainer(creationId);
  }
  // Carousel: video (kalau ada) di awal, lalu semua gambar, urutan items sudah benar.
  const children = [];
  for (const item of items.slice(0, 20)) {
    const childId = await threads.createContainer({
      mediaType: item.type,
      imageUrl: item.type === "IMAGE" ? item.url : undefined,
      videoUrl: item.type === "VIDEO" ? item.url : undefined,
      isCarouselItem: true,
    });
    children.push(childId);
  }
  for (const childId of children) await threads.waitUntilFinished(childId);

  const carouselId = await threads.createContainer({
    mediaType: "CAROUSEL",
    text,
    children,
    replyToId,
  });
  await threads.waitUntilFinished(carouselId);
  return threads.publishContainer(carouselId);
}

/**
 * Proses 1 baris "Acc" penuh: Utas 1 -> (jeda) -> Utas 2 -> Reply link.
 * Idempoten: kalau POST ID sudah keisi (mis. retry setelah gagal di tengah),
 * step itu di-skip dan ID lamanya dipakai sebagai target reply.
 */
async function publishRow(row, ctx) {
  const { sheets, drive, threads, headerMap } = ctx;
  const rowNum = row._rowNumber;
  const judul = String(row[C.JUDUL] || "").trim();
  const brand = String(row[C.BRAND] || "").trim();
  const link = resolveLink(row);

  const jeda = randomJedaMenit();

  const set = (col, v) => writeCell(sheets, headerMap, rowNum, col, v);

  let id1 = String(row[C.POST_ID_1] || "").trim();
  let id2 = String(row[C.POST_ID_2] || "").trim();
  let idR = String(row[C.POST_ID_REPLY] || "").trim();

  try {
    const t1 = applyPlaceholders(row[C.UTAS1], { brand, link });
    const t2 = applyPlaceholders(row[C.UTAS2], { brand, link });
    const tR = applyPlaceholders(row[C.REPLY], { brand, link });
    assertLen("Utas 1", t1);
    assertLen("Utas 2", t2);
    assertLen("Reply link", tR);
    if (!link) throw new Error('Kolom "Link Affiliate" kosong.');

    // ---- Utas 1 ----
    if (!id1) {
      console.log(`  -> Utas 1: ${judul}`);
      id1 = await publishText(threads, { text: t1 });
      await set(C.POST_ID_1, id1);
      console.log(`     OK Utas 1 = ${id1}`);
    } else {
      console.log(`  (skip Utas 1 — sudah ada ${id1})`);
    }

    // ---- Jeda ----
    if (!id2) {
      console.log(`  ... tunggu ${jeda.toFixed(1)} menit sebelum Utas 2`);
      if (!isDryRun()) await sleep(Math.round(jeda * 60 * 1000));
    }

    // ---- Utas 2 (reply ke Utas 1, + gambar) ----
    if (!id2) {
      const images = shuffleArray(await findImagesForTitle(drive, judul).catch(() => []));
      const video = await findVideoForTitle(drive, judul).catch(() => null);
      const mediaLabel = [
        video ? "1 video" : null,
        images.length ? `${images.length} gambar` : null,
      ].filter(Boolean).join(" + ") || "tanpa media";
      console.log(`  -> Utas 2: ${judul} (${mediaLabel})`);
      id2 = await publishWithMedia(threads, { text: t2, video, images, replyToId: id1 });
      await set(C.POST_ID_2, id2);
      console.log(`     OK Utas 2 = ${id2}`);
    } else {
      console.log(`  (skip Utas 2 — sudah ada ${id2})`);
    }

    // ---- Reply link (reply ke Utas 2) ----
    if (!idR) {
      console.log(`  -> Reply link: ${judul}`);
      idR = await publishText(threads, { text: tR, replyToId: id2 });
      await set(C.POST_ID_REPLY, idR);
      console.log(`     OK Reply = ${idR}`);
    } else {
      console.log(`  (skip Reply — sudah ada ${idR})`);
    }

    await set(C.STATUS, S.DONE);
    await set(C.CATATAN, `${S.DONE} ${new Date().toISOString()} — utas1 ${id1} · utas2 ${id2} · reply ${idR}`);
    console.log(`  SELESAI ${judul} -> STATUS "${S.DONE}"`);
  } catch (e) {
    const done = [
      id1 && `utas1 ${id1}`,
      id2 && `utas2 ${id2}`,
      idR && `reply ${idR}`,
    ].filter(Boolean).join(" · ");
    console.log(`  GAGAL ${judul}: ${e.message}${done ? ` (sudah keposting: ${done})` : ""}`);
    await set(C.STATUS, S.ERROR).catch(() => {});
    await set(C.CATATAN, `Error: ${e.message}${done ? ` | sudah keposting: ${done} — kosongkan POST ID & set "Acc" buat ulang` : ""}`).catch(() => {});
  }
}

async function runPublish({ sheets, drive, threads }) {
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR);
  const { headers, rows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, HR
  );

  const need = [C.JUDUL, C.STATUS, C.UTAS1, C.UTAS2, C.REPLY, C.LINK];
  const missing = need.filter((c) => !headers.includes(c));
  if (missing.length) {
    throw new Error(`Kolom wajib tidak ada di header baris ${HR}: ${missing.join(", ")}`);
  }

    const ready = rows.filter(
    (r) => String(r[C.STATUS] || "").trim().toLowerCase() === 
S.READY.toLowerCase()
  );
  const now = new Date();
  const actionable = ready.filter(
    (r) => tanggalUploadDue(r[C.TANGGAL], now, CONFIG.TIMEZONE) && 
jamThreadsPassed(r[C.JAM])
  );
  console.log(`${ready.length} baris "Acc" — ${actionable.length} sudah 
masuk Tanggal Upload & lewat Jam Threads.`);
  if (!actionable.length) {
    console.log("Tidak ada yang diproses run ini.");
    return;
  }

  // Satu baris per run, urut paling awal jamnya.
  actionable.sort((a, b) => (jamToMinutes(a[C.JAM]) ?? 0) - (jamToMinutes(b[C.JAM]) ?? 0));
  const row = actionable[0];
  const isManual = String(row[C.TIPE_KONTEN] || "").trim() === CONFIG.CONTENT_TYPE.MANUAL;
  console.log(`Proses baris ${row._rowNumber}: "${row[C.JUDUL]}"${isManual ? " (Manual)" : ""}`);
  const { publishManualThreadRow } = require("./publishManualThread");
  if (isManual) {
    try {
      await publishManualThreadRow(row, { sheets, drive, threads, jadwalHeaderMap: headerMap });
    } catch (e) {
      console.log(`  GAGAL (manual): ${e.message}`);
      await writeCell(sheets, headerMap, row._rowNumber, C.STATUS, S.ERROR).catch(() => {});
      await writeCell(
        sheets, headerMap, row._rowNumber, C.CATATAN,
        `Error: ${e.message} | baris utas yang sudah terlanjur publish TETAP tersimpan (cek tab UTAS MANUAL, POST ID) — retry akan lanjut dari yang belum selesai`
      ).catch(() => {});
    }
  } else {
    await publishRow(row, { sheets, drive, threads, headerMap });
  }
  console.log("Selesai proses publish.");
}

module.exports = {
  runPublish,
  publishRow,
  applyPlaceholders,
  resolveLink,
  stripInstructionLines,
  assertLen,
  writeCell,
  publishText,
  publishWithMedia,
  jamToMinutes,
  jamThreadsPassed,
  jamDisplay,
  randomJedaMenit,
};
