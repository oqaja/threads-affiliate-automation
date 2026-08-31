/**
 * rename-tab.js — ganti nama tab tracker.
 *   FROM="Untitled" TO="JADWAL THREADS" npm run rename-tab
 * FROM opsional (default: CONFIG.SHEET_NAME). Kalau cuma ada 1 tab, FROM diabaikan.
 */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");

(async () => {
  assertCoreConfig();
  const to = process.env.TO || process.argv[3];
  const from = process.env.FROM || process.argv[2];
  if (!to) {
    console.error('Wajib: TO="nama baru"');
    process.exit(1);
  }

  const { sheets } = await getGoogleAuthClients();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID });
  const tabs = meta.data.sheets || [];
  let target;
  if (from) target = tabs.find((s) => s.properties.title === from);
  else if (tabs.length === 1) target = tabs[0];
  else target = tabs.find((s) => s.properties.title === CONFIG.SHEET_NAME);

  if (!target) {
    console.error(`Tab sumber tidak ketemu. Tab yang ada: ${tabs.map((s) => s.properties.title).join(", ")}`);
    process.exit(1);
  }
  const oldTitle = target.properties.title;
  if (oldTitle === to) {
    console.log(`Tab sudah bernama "${to}", tidak ada perubahan.`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId: target.properties.sheetId, title: to }, fields: "title" } },
      ],
    },
  });
  console.log(`OK  tab "${oldTitle}" -> "${to}"`);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
