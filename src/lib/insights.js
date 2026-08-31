/**
 * insights.js
 * Polling Threads Insights -> tulis ke kolom "Auto dari Insights" di Sheet:
 *   Views Utas 1, Views Utas 2, Reply Rate (%).
 *
 * Reply Rate (%) = replies(Utas 1) / views(Utas 1) * 100.
 */

const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue } = require("./sheetsHelper");

const C = CONFIG.COL;

async function write(sheets, headerMap, rowNum, col, value) {
  if (!headerMap[col]) return;
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, rowNum, headerMap[col], value);
}

async function safeInsights(threads, mediaId) {
  try {
    return await threads.getMediaInsights(mediaId, ["views", "replies"]);
  } catch (e) {
    console.log(`  (info) insights ${mediaId} gagal: ${e.message}`);
    return {};
  }
}

async function runInsights({ sheets, threads }) {
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);
  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);

  const withPosts = rows.filter((r) => String(r[C.POST_ID_1] || "").trim());
  console.log(`${withPosts.length} baris punya POST ID - tarik insights.`);

  for (const row of withPosts) {
    const judul = String(row[C.JUDUL] || "").trim();
    const id1 = String(row[C.POST_ID_1] || "").trim();
    const id2 = String(row[C.POST_ID_2] || "").trim();

    const m1 = await safeInsights(threads, id1);
    const m2 = id2 ? await safeInsights(threads, id2) : {};

    if (typeof m1.views === "number") await write(sheets, headerMap, row._rowNumber, C.VIEWS_1, m1.views);
    if (typeof m2.views === "number") await write(sheets, headerMap, row._rowNumber, C.VIEWS_2, m2.views);

    if (typeof m1.views === "number" && m1.views > 0 && typeof m1.replies === "number") {
      const rate = Math.round((m1.replies / m1.views) * 1000) / 10;
      await write(sheets, headerMap, row._rowNumber, C.REPLY_RATE, rate);
    }
    console.log(`  ${judul}: views1=${m1.views ?? "-"} views2=${m2.views ?? "-"} replies1=${m1.replies ?? "-"}`);
  }
  console.log("Selesai proses insights.");
}

module.exports = { runInsights };
