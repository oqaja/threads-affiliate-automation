const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { getThreadsClient } = require("../src/lib/threadsAuth");
const { assertCoreConfig } = require("../src/lib/config");
const { runPublish } = require("../src/lib/publishThreads");

(async () => {
  console.log("=== Threads Affiliate - Publish ===");
  assertCoreConfig();
  const { sheets, drive } = await getGoogleAuthClients();
  const threads = await getThreadsClient();
  await runPublish({ sheets, drive, threads });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
