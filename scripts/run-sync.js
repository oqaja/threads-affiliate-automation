const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { assertCoreConfig } = require("../src/lib/config");
const { runSync } = require("../src/lib/syncDocsToSheet");

(async () => {
  console.log("=== Threads Affiliate - Sync Docs -> Sheet ===");
  assertCoreConfig();
  const { sheets, docs } = await getGoogleAuthClients();
  await runSync({ sheets, docs });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
