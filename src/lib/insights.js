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
const MC = CONFIG.MANUAL_COL;

async function write(sheets, headerMap, rowNum, col, value, sheetName) {
  if (!headerMap[col]) return;
  await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, sheetName, rowNum, headerMap[col], value);
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

    if (typeof m1.views === "number") await write(sheets, headerMap, row._rowNumber, C.VIEWS_1, m1.views, CONFIG.SHEET_NAME);
    if (typeof m2.views === "number") await write(sheets, headerMap, row._rowNumber, C.VIEWS_2, m2.views, CONFIG.SHEET_NAME);

    if (typeof m1.views === "number" && m1.views > 0 && typeof m1.replies === "number") {
      const rate = Math.round((m1.replies / m1.views) * 1000) / 10;
      await write(sheets, headerMap, row._rowNumber, C.REPLY_RATE, rate, CONFIG.SHEET_NAME);
    }
    console.log(`  ${judul}: views1=${m1.views ?? "-"} views2=${m2.views ?? "-"} replies1=${m1.replies ?? "-"}`);
  }

  await processManualInsights(sheets, threads, headerMap, rows);

  console.log("Selesai proses insights.");
}

async function processManualInsights(sheets, threads, jadwalHeaderMap, jadwalRows) {
  const manualRows = jadwalRows.filter(
    (r) => String(r[C.TIPE_KONTEN] || "").trim() === CONFIG.CONTENT_TYPE.MANUAL
  );
  if (!manualRows.length) return;

  const manualHeaderMap = await getHeaderColumnMap(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.MANUAL_SHEET_NAME, CONFIG.MANUAL_HEADER_ROW
  );
  const { rows: utasRows } = await readSheetAsObjects(
    sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.MANUAL_SHEET_NAME, CONFIG.MANUAL_HEADER_ROW
  );

  for (const jadwalRow of manualRows) {
    const idKonten = String(jadwalRow[C.ID_KONTEN] || "").trim();
    if (!idKonten) continue;

    const matched = utasRows
      .filter((r) => String(r[MC.ID_KONTEN] || "").trim() === idKonten)
      .filter((r) => String(r[MC.POST_ID] || "").trim());
    if (!matched.length) continue;

    // Urutkan sama seperti publishManualThreadRow, supaya "utas pertama"
    // (untuk Reply Rate) konsisten dengan urutan publish aslinya.
    const sorted = matched
      .map((row, origIdx) => {
        const raw = String(row[MC.URUTAN] || "").trim();
        const n = parseInt(raw, 10);
        const valid = raw !== "" && !isNaN(n);
        return { row, urutan: valid ? n : Infinity, origIdx };
      })
      .sort((a, b) => a.urutan - b.urutan || a.origIdx - b.origIdx)
      .map((x) => x.row);

    let firstMetrics = null;
    for (let i = 0; i < sorted.length; i++) {
      const utasRow = sorted[i];
      const postId = String(utasRow[MC.POST_ID] || "").trim();
      const m = await safeInsights(threads, postId);
      if (typeof m.views === "number") {
        await write(sheets, manualHeaderMap, utasRow._rowNumber, MC.VIEWS, m.views,
          CONFIG.MANUAL_SHEET_NAME);
      }
      if (i === 0) firstMetrics = m;
      console.log(`  [manual] ${idKonten} utas r${utasRow._rowNumber}: views=${m.views ?? "-"}`);
    }

    if (firstMetrics && typeof firstMetrics.views === "number" && firstMetrics.views > 0
        && typeof firstMetrics.replies === "number") {
      const rate = Math.round((firstMetrics.replies / firstMetrics.views) * 1000) / 10;
      await write(sheets, jadwalHeaderMap, jadwalRow._rowNumber, C.REPLY_RATE, rate,
        CONFIG.SHEET_NAME);
    }
  }
}

module.exports = { runInsights };
