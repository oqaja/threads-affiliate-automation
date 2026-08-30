const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { getThreadsClient } = require("../src/lib/threadsAuth");
const { assertCoreConfig } = require("../src/lib/config");
const { runInsights } = require("../src/lib/insights");

(async () => {
  console.log("=== Threads Affiliate - Insights ===");
  assertCoreConfig();
  const { sheets } = await getGoogleAuthClients();
  const threads = await getThreadsClient();
  await runInsights({ sheets, threads });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
