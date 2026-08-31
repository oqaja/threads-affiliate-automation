/**
 * check-setup.js — preflight. Cek semua koneksi tanpa nge-post apa pun.
 *
 *   npm run check
 *
 * Yang dicek:
 *   1. Service account creds ke-load
 *   2. Google Docs  : baca Doc konten + parse blok
 *   3. Google Sheets: baca tracker, cek header, tes tulis (no-op ke A1)
 *   4. Google Drive : list folder gambar + cek sharing publik
 *   5. Threads API  : validasi token (/me)
 *   6. Cross-check  : tiap blok Doc -> ada baris di Sheet? ada gambar di Drive?
 */

const { getGoogleAuthClients, getServiceAccountEmail } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { parseContentDoc } = require("../src/lib/docsReader");
const { readSheetAsObjects } = require("../src/lib/sheetsHelper");
const { listImagesInFolder, findImagesForTitle } = require("../src/lib/driveFinder");
const { extractLines } = require("../src/lib/docsReader");

const C = CONFIG.COL;
let problems = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  problems++;
};
const warn = (m) => console.log(`  ! ${m}`);

(async () => {
  console.log("=== Threads Affiliate — preflight ===\n");
  assertCoreConfig();
  ok(`Config: Doc=${CONFIG.CONTENT_DOC_ID.slice(0, 8)}… Sheet=${CONFIG.TRACKER_SPREADSHEET_ID.slice(0, 8)}… Folder=${CONFIG.DRIVE_IMAGE_FOLDER_ID.slice(0, 8)}…`);

  const { sheets, drive, docs } = await getGoogleAuthClients();

  // 2. Docs
  let blocks = [];
  console.log("\n[Google Docs]");
  try {
    const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
    blocks = parseContentDoc(doc);
    ok(`Baca Doc "${doc.title}" — ${blocks.length} blok konten valid`);
    if (blocks.length === 0) {
      const lines = extractLines(doc).filter((l) => l.trim() !== "");
      warn(`Doc tidak match format template. ${lines.length} baris terisi. 40 baris pertama:`);
      lines.slice(0, 40).forEach((l, i) => console.log(`      ${String(i + 1).padStart(2)}| ${l.slice(0, 100)}`));
      console.log(`      (parser butuh baris label "Judul Konten" + marker "--- UTAS 1 (Hook) ---" dll — lihat docs/Template_Konten...)`);
    }
    blocks.forEach((b) =>
      console.log(
        `      • ${b.judul}  [${b.pilar || "-"}]  jam ${b.jamThreads || "-"}  ` +
          `utas1:${b.utas1.length}c utas2:${b.utas2.length}c reply:${b.reply.length}c`
      )
    );
    for (const b of blocks) {
      for (const [label, text] of [["Utas 1", b.utas1], ["Utas 2", b.utas2], ["Reply", b.reply]]) {
        if (!text) bad(`"${b.judul}" — ${label} kosong`);
        else if (text.length > CONFIG.THREADS_MAX_TEXT) bad(`"${b.judul}" — ${label} ${text.length}c > ${CONFIG.THREADS_MAX_TEXT}`);
      }
    }
  } catch (e) {
    bad(`Gagal baca Doc: ${e.message}`);
  }

  // 3. Sheets
  console.log("\n[Google Sheets]");
  let sheetRows = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID });
    const tabs = (meta.data.sheets || []).map((s) => s.properties.title);
    console.log(`      tab yang ada: ${tabs.map((t) => `"${t}"`).join(", ")}`);
    for (const t of tabs) {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID,
        range: `'${t}'!A1:Z3`,
      });
      const grid = r.data.values || [];
      grid.forEach((row, i) => console.log(`      "${t}" row ${i + 1}: ${JSON.stringify(row)}`));
    }
    if (!tabs.includes(CONFIG.SHEET_NAME)) {
      warn(`Tab "${CONFIG.SHEET_NAME}" belum ada — akan dibuat otomatis + header saat "npm run sync" pertama.`);
    }
  } catch (e) {
    bad(`Gagal baca metadata spreadsheet: ${e.message}`);
  }
  try {
    const { headers, rows } = await readSheetAsObjects(
      sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
    );
    sheetRows = rows;
    ok(`Baca tab "${CONFIG.SHEET_NAME}" (header baris ${CONFIG.HEADER_ROW}) — ${rows.length} baris data`);
    const need = [C.JUDUL, C.STATUS, C.LINK, C.JEDA_UTAS2, C.POST_ID_1, C.POST_ID_2, C.POST_ID_REPLY, C.VIEWS_1];
    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) bad(`Header kurang di baris ${CONFIG.HEADER_ROW}: ${missing.join(", ")}`);
    else ok("Header inti lengkap");

    // Tes tulis: tulis balik nilai header JUDUL ke sel-nya sendiri (tidak mengubah apa pun).
    const { columnNumberToLetter } = require("../src/lib/sheetsHelper");
    const judulCol = headers.indexOf(C.JUDUL) + 1;
    if (judulCol > 0) {
      try {
        const cell = `${columnNumberToLetter(judulCol)}${CONFIG.HEADER_ROW}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID,
          range: `'${CONFIG.SHEET_NAME}'!${cell}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[C.JUDUL]] },
        });
        ok("Tes tulis ke Sheet berhasil (service account = Editor)");
      } catch (e) {
        bad(`Tidak bisa tulis ke Sheet — share tracker ke ${getServiceAccountEmail()} sebagai Editor. (${e.message})`);
      }
    }
  } catch (e) {
    bad(`Gagal baca Sheet (tab "${CONFIG.SHEET_NAME}"): ${e.message}`);
  }

  // 4. Drive
  console.log("\n[Google Drive]");
  let images = [];
  try {
    images = await listImagesInFolder(drive);
    ok(`Folder gambar OK — ${images.length} file gambar`);
    try {
      const meta = await drive.files.get({
        fileId: CONFIG.DRIVE_IMAGE_FOLDER_ID,
        fields: "id,name,permissions(type,role)",
        supportsAllDrives: true,
      });
      const anyone = (meta.data.permissions || []).some((p) => p.type === "anyone");
      if (anyone) ok('Folder di-share "Anyone with the link" — Threads bisa fetch gambar');
      else warn('Folder BELUM "Anyone with the link". Threads API tidak akan bisa fetch gambar — set share ke publik (Viewer).');
    } catch {
      warn('Tidak bisa cek permission folder (scope readonly). Pastikan manual: folder di-share "Anyone with the link → Viewer".');
    }
  } catch (e) {
    bad(`Gagal akses folder Drive: ${e.message}`);
  }

  // 5. Threads
  console.log("\n[Threads API]");
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !token) {
    bad("THREADS_USER_ID / THREADS_ACCESS_TOKEN belum di-set");
  } else {
    try {
      const u = new URL("https://graph.threads.net/v1.0/me");
      u.searchParams.set("fields", "id,username");
      u.searchParams.set("access_token", token);
      const r = await fetch(u);
      const j = await r.json();
      if (!r.ok) bad(`Token Threads invalid: ${j.error ? j.error.message : r.status}`);
      else if (String(j.id) !== String(userId)) bad(`THREADS_USER_ID (${userId}) ≠ id dari token (${j.id})`);
      else ok(`Token valid — @${j.username} (id ${j.id})`);
    } catch (e) {
      bad(`Gagal call Threads /me: ${e.message}`);
    }
  }

  // 6. Cross-check
  console.log("\n[Cross-check Doc ↔ Sheet ↔ Drive]");
  const sheetByJudul = new Map(sheetRows.map((r) => [String(r[C.JUDUL] || "").trim().toLowerCase(), r]));
  for (const b of blocks) {
    const key = b.judul.toLowerCase();
    const row = sheetByJudul.get(key);
    const imgs = await findImagesForTitle(drive, b.judul).catch(() => []);
    const rowStr = row ? `Sheet: baris ${row._rowNumber}, STATUS "${row[C.STATUS] || "(kosong)"}"` : "Sheet: BELUM ADA (akan di-append saat sync)";
    const imgStr = imgs.length ? `${imgs.length} gambar (${imgs.map((i) => i.name).join(", ")})` : "0 gambar → Utas 2 jadi text-only";
    console.log(`   • ${b.judul}\n       ${rowStr}\n       ${imgStr}`);
  }

  console.log(`\n  service account: ${getServiceAccountEmail()}`);
  console.log(`\n=== ${problems ? `${problems} masalah — beresin dulu sebelum publish` : "Semua hijau. Siap dry-run: DRY_RUN=1 npm run publish"} ===`);
  process.exit(problems ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
