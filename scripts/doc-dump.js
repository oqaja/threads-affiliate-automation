/** doc-dump.js — cetak semua baris mentah Doc + hasil parse. Buat debug format Doc. */

const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { CONFIG, assertCoreConfig } = require("../src/lib/config");
const { extractLines, parseContentDoc } = require("../src/lib/docsReader");

(async () => {
  assertCoreConfig();
  const { docs } = await getGoogleAuthClients();
  const doc = await docs.documents.get({ documentId: CONFIG.CONTENT_DOC_ID }).then((r) => r.data);
  const lines = extractLines(doc);

  console.log(`=== Doc "${doc.title}" — ${lines.length} baris mentah ===`);
  lines.forEach((l, i) => console.log(`${String(i + 1).padStart(3)} | ${JSON.stringify(l)}`));

  const blocks = parseContentDoc(doc);
  console.log(`\n=== ${blocks.length} blok ke-parse ===`);
  blocks.forEach((b, i) => {
    console.log(`\n[${i + 1}] judul: ${JSON.stringify(b.judul)}`);
    console.log(`    utas1(${b.utas1.length}): ${JSON.stringify(b.utas1.slice(0, 80))}`);
    console.log(`    utas2(${b.utas2.length}): ${JSON.stringify(b.utas2.slice(0, 80))}`);
    console.log(`    reply(${b.reply.length}): ${JSON.stringify(b.reply.slice(0, 80))}`);
  });
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
