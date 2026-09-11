const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { assertCoreConfig, assertGeminiConfig } = require("../src/lib/config");
const { runGenerateFromBrief } = require("../src/lib/generateFromBrief");

(async () => {
  console.log("=== Threads Affiliate - Generate from Brief ===");
  assertCoreConfig();
  assertGeminiConfig();
  const { sheets } = await getGoogleAuthClients();
  await runGenerateFromBrief({ sheets });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
