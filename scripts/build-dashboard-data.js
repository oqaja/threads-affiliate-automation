/**
 * build-dashboard-data.js
 * Snapshot Sheets + Docs -> dashboard/data.json (dibaca PWA, read-only).
 * Dijalankan di GitHub Actions (service account tetap di Secrets, tidak pernah ke frontend).
 */

const fs = require("fs");
const path = require("path");
const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { parseContentDoc } = require("../src/lib/docsReader");
const { readSheetAsObjects } = require("../src/lib/sheetsHelper");
const { jamToMinutes } = require("../src/lib/publishThreads");

const C = CONFIG.COL;
const num = (v) => {
  const n = Number(String(v).toString().replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const jamHHMM = (cell) => {
  const t = jamToMinutes(cell);
  return t == null ? "" : `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

(async () => {
  assertCoreConfig();
  const { sheets, docs } = await getGoogleAuthClients();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID });
  const tab = (meta.data.sheets || []).find((s) => s.properties.title === CONFIG.SHEET_NAME);
  const gid = tab ? tab.properties.sheetId : 0;

  const { rows } = await readSheetAsObjects(
    sheets,
    CONFIG.TRACKER_SPREADSHEET_ID,
    CONFIG.SHEET_NAME,
    CONFIG.HEADER_ROW
  );

  const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
  const blocks = {};
  for (const b of parseContentDoc(doc)) blocks[b.judul.trim().toLowerCase()] = b;

  const items = rows
    .filter((r) => String(r[C.JUDUL] || "").trim())
    .map((r) => {
      const judul = String(r[C.JUDUL]).trim();
      const b = blocks[judul.toLowerCase()] || null;
      return {
        row: r._rowNumber,
        judul,
        pilar: String(r[C.PILAR] || "").trim(),
        brand: String(r[C.BRAND] || "").trim(),
        brandRef: String(r[C.BRAND_REF] || "").trim(),
        jam: jamHHMM(r[C.JAM]),
        jamMin: jamToMinutes(r[C.JAM]),
        link: String(r[C.LINK] || "").trim(),
        status: String(r[C.STATUS] || "").trim(),
        jeda: num(r[C.JEDA_UTAS2]),
        postId1: String(r[C.POST_ID_1] || "").trim(),
        postId2: String(r[C.POST_ID_2] || "").trim(),
        postIdReply: String(r[C.POST_ID_REPLY] || "").trim(),
        views1: num(r[C.VIEWS_1]),
        views2: num(r[C.VIEWS_2]),
        replyRate: num(r[C.REPLY_RATE]),
        catatan: String(r[C.CATATAN] || "").trim(),
        hasContent: !!b,
        content: b ? { utas1: b.utas1, utas2: b.utas2, reply: b.reply } : null,
      };
    });

  const out = {
    generatedAt: new Date().toISOString(),
    repo: process.env.GITHUB_REPOSITORY || "oqaja/threads-affiliate-automation",
    sheetId: CONFIG.TRACKER_SPREADSHEET_ID,
    sheetGid: gid,
    sheetName: CONFIG.SHEET_NAME,
    headerRow: CONFIG.HEADER_ROW,
    docId: CONFIG.CONTENT_DOC_ID,
    driveFolderId: CONFIG.DRIVE_IMAGE_FOLDER_ID,
    statusValues: CONFIG.STATUS,
    threadsMaxText: CONFIG.THREADS_MAX_TEXT,
    items,
  };

  const dir = path.join(__dirname, "..", "dashboard");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify(out, null, 2));
  console.log(`dashboard/data.json — ${items.length} konten, ${new Date().toISOString()}`);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
