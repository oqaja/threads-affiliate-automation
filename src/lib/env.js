/** Helper environment kecil. */

/** DRY_RUN aktif kalau di-set ke nilai selain "", "0", "false". */
function isDryRun() {
  const v = String(process.env.DRY_RUN || "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no";
}

module.exports = { isDryRun };
