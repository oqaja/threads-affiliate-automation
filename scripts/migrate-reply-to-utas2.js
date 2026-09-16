const { getGoogleAuthClients } = require("../src/lib/googleAuth");
const { assertCoreConfig } = require("../src/lib/config");
const { migrateReplyToUtas2 } = require("../src/lib/migrateReplyToUtas2");

(async () => {
  console.log("=== Migrasi: gabung Reply ke Utas 2 ===");
  assertCoreConfig();
  const { sheets } = await getGoogleAuthClients();
  await migrateReplyToUtas2({ sheets });
})().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
