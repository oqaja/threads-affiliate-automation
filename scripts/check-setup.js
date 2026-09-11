/**
 * check-setup.js — preflight. Cek semua koneksi tanpa nge-post apa pun.
 *
 *   npm run check
 *
 * Yang dicek:
 *   1. Service account creds ke-load
 *   2. Google Sheets: baca tab "JADWAL THREADS", cek header lengkap, tes tulis (no-op)
 *   3. Google Drive : list folder gambar + cek sharing publik
 *   4. Threads API  : validasi token (/me)
 *   5. Per baris "Acc": teks Utas 1/2/Reply keisi + panjang OK, gambar ada berapa
 */

const { getGoogleAuthClients, getServiceAccountEmail } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { readSheetAsObjects, columnNumberToLetter } = require("../src/lib/sheetsHelper");
const { listImagesInFolder, findImagesForTitle } = require("../src/lib/driveFinder");
const { applyPlaceholders, resolveLink, jamDisplay } = require("../src/lib/publishThreads");

const C = CONFIG.COL;
const S = CONFIG.STATUS;
let problems = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  problems++;
};
const warn = (m) => console.log(`  ! ${m}`);

const ALL_COLS = Object.values(C);

(async () => {
  console.log("=== Threads Affiliate — preflight ===\n");
  assertCoreConfig();
  ok(`Config: Sheet=${CONFIG.TRACKER_SPREADSHEET_ID.slice(0, 8)}… Folder=${CONFIG.DRIVE_IMAGE_FOLDER_ID.slice(0, 8)}… Tab="${CONFIG.SHEET_NAME}" (header baris ${CONFIG.HEADER_ROW})`);

  const { sheets, drive } = await getGoogleAuthClients();

  // 2. Sheets
  console.log("\n[Google Sheets]");
  let sheetRows = [];
  let sheetHeaders = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.TRACKER_SPREADSHEET_ID });
    const tabs = (meta.data.sheets || []).map((s) => s.properties.title);
    console.log(`      tab yang ada: ${tabs.map((t) => `"${t}"`).join(", ")}`);
    if (!tabs.includes(CONFIG.SHEET_NAME)) bad(`Tab "${CONFIG.SHEET_NAME}" tidak ada.`);
  } catch (e) {
    bad(`Gagal baca metadata spreadsheet: ${e.message}`);
  }
  try {
    const { headers, rows } = await readSheetAsObjects(
      sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW
    );
    sheetRows = rows;
    sheetHeaders = headers;
    ok(`Baca tab "${CONFIG.SHEET_NAME}" — ${rows.length} baris data`);

    const need = [C.JUDUL, C.STATUS, C.LINK, C.UTAS1, C.UTAS2, C.REPLY, C.POST_ID_1, C.POST_ID_2, C.POST_ID_REPLY];
    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) bad(`Header wajib kurang di baris ${CONFIG.HEADER_ROW}: ${missing.join(", ")}`);
    else ok("Header inti lengkap (Judul, STATUS, Link, Utas 1/2, Reply, POST ID x3)");

    const unknownExpected = ALL_COLS.filter((h) => !headers.includes(h));
    if (unknownExpected.length) warn(`Kolom yang dikenal script tapi tidak ada di Sheet (opsional): ${unknownExpected.join(", ")}`);

    // Tes tulis: tulis balik nilai header JUDUL ke sel-nya sendiri (tidak mengubah apa pun).
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

  // 3. Drive
  console.log("\n[Google Drive]");
  try {
    const images = await listImagesInFolder(drive);
    ok(`Folder gambar OK — ${images.length} file gambar`);
    try {
      const dm = await drive.files.get({
        fileId: CONFIG.DRIVE_IMAGE_FOLDER_ID,
        fields: "id,name,permissions(type,role)",
        supportsAllDrives: true,
      });
      const anyone = (dm.data.permissions || []).some((p) => p.type === "anyone");
      if (anyone) ok('Folder di-share "Anyone with the link" — Threads bisa fetch gambar');
      else warn('Folder BELUM "Anyone with the link". Threads API tidak akan bisa fetch gambar — set share ke publik (Viewer).');
    } catch {
      warn('Tidak bisa cek permission folder (scope readonly). Pastikan manual: folder di-share "Anyone with the link → Viewer".');
    }
  } catch (e) {
    bad(`Gagal akses folder Drive: ${e.message}`);
  }

  // 4. Threads
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

  // 5. Per baris "Acc"
  if (sheetHeaders.length) {
    console.log(`\n[Baris siap publish — STATUS "${S.READY}"]`);
    const ready = sheetRows.filter((r) => String(r[C.STATUS] || "").trim().toLowerCase() === S.READY.toLowerCase());
    if (!ready.length) console.log(`      (belum ada baris "${S.READY}" — isi manual di Google Sheets pas mau dijadwalkan)`);
    for (const row of ready) {
      const judul = String(row[C.JUDUL] || "").trim();
      const brand = String(row[C.BRAND] || "").trim();
      const link = resolveLink(row);
      const imgs = await findImagesForTitle(drive, judul).catch(() => []);
      const parts = [
        ["Utas 1", applyPlaceholders(row[C.UTAS1], { brand, link })],
        ["Utas 2", applyPlaceholders(row[C.UTAS2], { brand, link })],
        ["Reply", applyPlaceholders(row[C.REPLY], { brand, link })],
      ];
      console.log(`   • ${judul}  (baris ${row._rowNumber})  jam ${jamDisplay(row[C.JAM])}`);
      for (const [label, text] of parts) {
        if (!text) bad(`     ${judul} — ${label} kosong`);
        else if (text.length > CONFIG.THREADS_MAX_TEXT) bad(`     ${judul} — ${label} ${text.length}c > ${CONFIG.THREADS_MAX_TEXT}`);
        else console.log(`     ${label}: ${text.length}c`);
      }
      if (!link) bad(`     ${judul} — Link Affiliate kosong`);
      if (!brand && (parts.some(([, t]) => t.includes("[Brand/Produk]")))) warn(`     ${judul} — Brand/Produk kosong tapi teks masih ada "[Brand/Produk]"`);
      console.log(`     gambar: ${imgs.length ? imgs.map((i) => i.name).join(", ") : "0 → Utas 2 text-only"}`);
    }
  }

  console.log(`\n  service account: ${getServiceAccountEmail()}`);
  console.log(`\n=== ${problems ? `${problems} masalah — beresin dulu sebelum publish` : "Semua hijau. Siap dry-run: DRY_RUN=1 npm run publish"} ===`);
  process.exit(problems ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
