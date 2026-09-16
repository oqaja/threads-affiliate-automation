const { CONFIG } = require("./config");
const { readSheetAsObjects, getHeaderColumnMap, setCellValue } = require("./sheetsHelper");
const { isDryRun } = require("./env");

const C = CONFIG.COL;

/**
 * Gabungin utas2 + reply jadi 1 teks <= CONFIG.THREADS_MAX_TEXT karakter.
 * Kalau kepanjangan, potong dari Utas 2 (bukan dari reply, supaya CTA/link
 * di reply tetap utuh). Potong di whitespace terakhir sebelum limit kalau
 * memungkinkan (hindari motong di tengah kata).
 * Return { text, truncated: boolean, needsManualReview: boolean }.
 */
function mergeUtas2AndReply(utas2, reply) {
  const sep = "\n";
  const combined = utas2 + sep + reply;
  if (combined.length <= CONFIG.THREADS_MAX_TEXT) {
    return { text: combined, truncated: false, needsManualReview: false };
  }

  const maxForUtas2 = CONFIG.THREADS_MAX_TEXT - sep.length - reply.length;
  if (maxForUtas2 <= 0) {
    // Reply sendiri sudah mepet/lewat limit gabungan — jangan dipotong paksa,
    // laporkan untuk di-edit manual.
    return { text: null, truncated: false, needsManualReview: true };
  }

  let cut = utas2.slice(0, maxForUtas2);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxForUtas2 * 0.7) cut = cut.slice(0, lastSpace); // hindari motong tengah kata kalau spasi-nya gak terlalu jauh dari limit
  const text = cut.trimEnd() + sep + reply;
  return { text, truncated: true, needsManualReview: false };
}

async function migrateReplyToUtas2({ sheets }) {
  const headerMap = await getHeaderColumnMap(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);
  const { rows } = await readSheetAsObjects(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, CONFIG.HEADER_ROW);

  const eligible = rows.filter((r) => {
    const status = String(r[C.STATUS] || "").trim();
    const isActionableStatus = status === CONFIG.STATUS.READY || status === CONFIG.STATUS.ERROR;
    const notPublished = !String(r[C.POST_ID_1] || "").trim() && !String(r[C.POST_ID_2] || "").trim();
    const hasReply = String(r[C.REPLY] || "").trim() !== "";
    return isActionableStatus && notPublished && hasReply;
  });

  const alreadyPublished = rows.filter((r) => {
    const hasReply = String(r[C.REPLY] || "").trim() !== "";
    const partiallyPublished = String(r[C.POST_ID_1] || "").trim() || String(r[C.POST_ID_2] || "").trim();
    return hasReply && partiallyPublished;
  });

  const otherHasReply = rows.filter((r) => {
    const hasReply = String(r[C.REPLY] || "").trim() !== "";
    if (!hasReply) return false;
    const inEligible = eligible.includes(r);
    const inAlreadyPublished = alreadyPublished.includes(r);
    return !inEligible && !inAlreadyPublished;
  });

  console.log(`${eligible.length} baris memenuhi syarat migrasi.`);
  console.log(`${alreadyPublished.length} baris DILEWATI (sudah sempat publish sebagian, tidak bisa diubah).`);
  if (otherHasReply.length) {
    console.log(`${otherHasReply.length} baris punya Reply tapi TIDAK diproses (status bukan Acc/Gagal) — tidak disentuh:`);
    otherHasReply.forEach((r) => console.log(`  - r${r._rowNumber}: "${String(r[C.JUDUL] || "").trim()}" (status: "${String(r[C.STATUS] || "").trim() || "(kosong)"}")`));
  }

  let migrated = 0;
  let needsReview = [];

  for (const row of eligible) {
    const judul = String(row[C.JUDUL] || "").trim();
    const utas2 = String(row[C.UTAS2] || "").trim();
    const reply = String(row[C.REPLY] || "").trim();
    const result = mergeUtas2AndReply(utas2, reply);

    if (result.needsManualReview) {
      needsReview.push({ rowNumber: row._rowNumber, judul });
      console.log(`  ⚠️  r${row._rowNumber} "${judul}" — Reply terlalu panjang untuk digabung, PERLU EDIT MANUAL.`);
      continue;
    }

    console.log(`  ${isDryRun() ? "[DRY] " : ""}r${row._rowNumber} "${judul}"${result.truncated ? " (Utas 2 dipotong)" : ""}`);
    if (!isDryRun()) {
      await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, row._rowNumber, headerMap[C.UTAS2], result.text);
      await setCellValue(sheets, CONFIG.TRACKER_SPREADSHEET_ID, CONFIG.SHEET_NAME, row._rowNumber, headerMap[C.REPLY], "");
    }
    migrated++;
  }

  console.log(`\n=== Ringkasan ===`);
  console.log(`Dimigrasi: ${migrated}`);
  console.log(`Dilewati (sudah publish sebagian): ${alreadyPublished.length}`);
  console.log(`Perlu edit manual (Reply kepanjangan): ${needsReview.length}`);
  if (needsReview.length) {
    console.log(`Baris yang perlu edit manual:`);
    needsReview.forEach((r) => console.log(`  - r${r.rowNumber}: "${r.judul}"`));
  }
  if (isDryRun()) console.log(`\n(DRY RUN — tidak ada yang beneran ditulis ke Sheet.)`);
}

module.exports = { migrateReplyToUtas2, mergeUtas2AndReply };
