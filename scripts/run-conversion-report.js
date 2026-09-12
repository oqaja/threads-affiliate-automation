const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { assertCoreConfig, assertShopeeConfig } = require("../src/lib/config");
const { runConversionReport } = require("../src/lib/conversionReport");

(async () => {
  console.log("=== Shopee Affiliate - Conversion Report ===");
  assertCoreConfig();
  assertShopeeConfig();
  const { sheets } = await getGoogleAuthClients();
  await runConversionReport({ sheets });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
