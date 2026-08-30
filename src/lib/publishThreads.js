/**
 * publishThreads.js
 * State machine publish 1 konten = 3 post berantai di Threads:
 *
 *   STATUS "Acc"            -> post UTAS 1 (hook, text only)      -> STATUS "Utas 1 Posted"
 *   STATUS "Utas 1 Posted"  -> setelah jeda: post UTAS 2 (produk + gambar, reply ke Utas 1)
 *                                                                -> STATUS "Utas 2 Posted"
 *   STATUS "Utas 2 Posted"  -> post REPLY (link affiliate, reply ke Utas 2)
 *                                                                -> STATUS "Published"
 *
 * Dijalankan berkala (cron tiap 15 menit). Jeda antar-utas ditangani lewat STATUS + timestamp,
 * bukan sleep, supaya aman di GitHub Actions.
 */

const { CONFIG } = require("./config");
const { parseContentDoc } = require("./docsReader");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue } = require("./sheetsHelper");
const { combineDateAndTime } = require("./dateUtils");
const { findImagesForTitle } = require("./driveFinder");

const C = CONFIG.COL;
const S = CONFIG.STATUS;
const TS1 = CONFIG.COL_INTERNAL.TS_UTAS1;

function normKey(s) {
  return String(s || "").trim().toLowerCase();
}

/** Buang baris yang seluruhnya instruksi dalam kurung siku, mis. "[script otomatis replace ...]". */
function stripInstructionLines(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\[[^\]]*\]\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveLink(row) {
  const link = String(row[C.LINK] || "").trim();
  const utm = String(row[C.UTM] || "").trim();
  if (!utm) return link;
  if (/^https?:\/\//i.test(utm)) return utm;
  if (utm.startsWith("?") || utm.startsWith("&")) {
    const sep = link.includes("?") ? "&" : "";
    return link + (utm.startsWith("?") && link.includes("?") ? "&" + utm.slice(1) : sep + utm);
  }
  return link;
}

function applyPlaceholders(text, { brand, link }) {
  let out = stripInstructionLines(text || "");
  if (brand) out = out.split(CONFIG.PLACEHOLDER.BRAND).join(brand);
  if (link) out = out.split(CONFIG.PLACEHOLDER.LINK).join(link);
  return out.trim();
}

function assertLen(label, text) {
  if (text.length > CONFIG.THREADS_MAX_TEXT) {
    throw new Error(`${label} ${text.length} karakter, lewat batas ${CONFIG.THREADS_MAX_TEXT}. Pendekin di Docs.`);
  }
  if (!text) throw new Error(`${label} kosong.`);
}

function minutesSince(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

async function write(sheets, headerMap, rowNumber, col, value) {
  if (!headerMap[col]) return;
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowNumber, headerMap[col], value);
}

/** Publish 1 post text-only (utas 1 / reply). */
async function publishText(threads, { text, replyToId }) {
  const creationId = await threads.createContainer({ mediaType: "TEXT", text, replyToId });
  await threads.waitUntilFinished(creationId);
  return threads.publishContainer(creationId);
}

/** Publish 1 post dengan 0..n gambar (utas 2). */
async function publishWithImages(threads, { text, images, replyToId }) {
  if (!images.length) {
    return publishText(threads, { text, replyToId });
  }
  if (images.length === 1) {
    const creationId = await threads.createContainer({
      mediaType: "IMAGE",
      text,
      imageUrl: images[0].url,
      replyToId,
    });
    await threads.waitUntilFinished(creationId);
    return threads.publishContainer(creationId);
  }
  // Carousel
  const children = [];
  for (const img of images.slice(0, 20)) {
    const childId = await threads.createContainer({
      mediaType: "IMAGE",
      imageUrl: img.url,
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

async function processRow(row, block, ctx) {
  const { sheets, drive, threads, headerMap } = ctx;
  const rowNum = row._rowNumber;
  const judul = String(row[C.JUDUL] || "").trim();
  const status = String(row[C.STATUS] || "").trim();
  const brand = String(row[C.BRAND] || "").trim();

  const setStatus = (v) => write(sheets, headerMap, rowNum, C.STATUS, v);
  const setCatatan = (v) => write(sheets, headerMap, rowNum, C.CATATAN, v);

  try {
    // ---- Step 1: UTAS 1 ----
    if (status === S.READY && !String(row[C.POST_ID_1] || "").trim()) {
      const jadwal = combineDateAndTime(row[C.TANGGAL], row[C.JAM], CONFIG.TIMEZONE);
      if (jadwal && jadwal.getTime() > Date.now()) {
        console.log(`  (skip) ${judul}: belum waktunya (jadwal ${jadwal.toISOString()}).`);
        return;
      }
      const text = applyPlaceholders(block.utas1, { brand });
      assertLen("Utas 1", text);

      console.log(`  -> post Utas 1: ${judul}`);
      const id1 = await publishText(threads, { text });
      await write(sheets, headerMap, rowNum, C.POST_ID_1, id1);
      await write(sheets, headerMap, rowNum, TS1, new Date().toISOString());
      await setStatus(S.UTAS1_DONE);
      await setCatatan(`Utas 1 published ${id1}`);
      return;
    }

    // ---- Step 2: UTAS 2 ----
    if (status === S.UTAS1_DONE && String(row[C.POST_ID_1] || "").trim() && !String(row[C.POST_ID_2] || "").trim()) {
      const jeda = Number(row[C.JEDA_UTAS2]) || CONFIG.DEFAULT_JEDA_UTAS2_MENIT;
      const elapsed = minutesSince(String(row[TS1] || ""));
      if (elapsed < jeda) {
        console.log(`  (tunggu) ${judul}: jeda Utas 2 ${elapsed.toFixed(1)}/${jeda} menit.`);
        return;
      }
      const text = applyPlaceholders(block.utas2, { brand });
      assertLen("Utas 2", text);
      const images = await findImagesForTitle(drive, judul);
      console.log(`  -> post Utas 2: ${judul} (${images.length} gambar)`);

      const id2 = await publishWithImages(threads, {
        text,
        images,
        replyToId: String(row[C.POST_ID_1]).trim(),
      });
      await write(sheets, headerMap, rowNum, C.POST_ID_2, id2);
      await setStatus(S.UTAS2_DONE);
      await setCatatan(`Utas 2 published ${id2} (${images.length} gambar)`);
      return;
    }

    // ---- Step 3: REPLY LINK ----
    if (status === S.UTAS2_DONE && String(row[C.POST_ID_2] || "").trim() && !String(row[C.POST_ID_REPLY] || "").trim()) {
      const link = resolveLink(row);
      if (!link) throw new Error("Link Affiliate kosong.");
      const text = applyPlaceholders(block.reply, { brand, link });
      assertLen("Reply link", text);

      console.log(`  -> post Reply link: ${judul}`);
      const idR = await publishText(threads, { text, replyToId: String(row[C.POST_ID_2]).trim() });
      await write(sheets, headerMap, rowNum, C.POST_ID_REPLY, idR);
      await setStatus(S.PUBLISHED);
      await setCatatan(`Selesai. Reply link ${idR}`);
      return;
    }
  } catch (e) {
    console.log(`  GAGAL ${judul}: ${e.message}`);
    await setStatus(S.ERROR).catch(() => {});
    await setCatatan(`Error: ${e.message}`).catch(() => {});
  }
}

async function runPublish({ sheets, drive, docs, threads }) {
  const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
  const blocks = parseContentDoc(doc);
  const blockByJudul = new Map(blocks.map((b) => [normKey(b.judul), b]));

  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME);
  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME);

  const actionable = new Set([S.READY, S.UTAS1_DONE, S.UTAS2_DONE]);
  const todo = rows.filter((r) => actionable.has(String(r[C.STATUS] || "").trim()));
  console.log(`${todo.length} baris actionable.`);

  for (const row of todo) {
    const block = blockByJudul.get(normKey(row[C.JUDUL]));
    if (!block) {
      console.log(`  (skip) "${row[C.JUDUL]}" tidak ketemu di Docs.`);
      continue;
    }
    await processRow(row, block, { sheets, drive, threads, headerMap });
  }
  console.log("Selesai proses publish.");
}

module.exports = { runPublish, applyPlaceholders, resolveLink, stripInstructionLines };
