/**
 * backfill-row-id.js — pastikan kolom "Row ID" ada di tab "JADWAL THREADS" dan
 * semua baris yang belum punya Row ID diisi (ID unik & permanen).
 *
 *   npm run backfill-row-id
 *
 * Jalankan ini sebelum bikin/nge-tag Link Affiliate baru (Row ID dipakai sbg
 * subId2 di link), dan boleh diulang kapan saja — baris yang sudah punya
 * Row ID tidak disentuh.
 */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { assertCoreConfig } = require("../src/lib/config");
const { ensureRowIds } = require("../src/lib/rowId");

(async () => {
  console.log("=== JADWAL THREADS - Backfill Row ID ===");
  assertCoreConfig();
  const { sheets } = await getGoogleAuthClients();
  const filled = await ensureRowIds({ sheets });
  console.log(filled ? `Selesai — ${filled} baris diisi Row ID baru.` : "Selesai — semua baris sudah punya Row ID.");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
