const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { getThreadsClient } = require("../src/lib/threadsAuth");
const { assertCoreConfig } = require("../src/lib/config");
const { runSync } = require("../src/lib/syncDocsToSheet");
const { runPublish } = require("../src/lib/publishThreads");

(async () => {
  console.log("=== Threads Affiliate - Publish ===");
  assertCoreConfig();
  const { sheets, drive, docs } = await getGoogleAuthClients();
  const threads = await getThreadsClient();

  // Sync dulu supaya baris baru dari Docs langsung ada di Sheet.
  await runSync({ sheets, docs });
  await runPublish({ sheets, drive, docs, threads });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
