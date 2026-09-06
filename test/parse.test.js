const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyPlaceholders,
  resolveLink,
  stripInstructionLines,
  jamToMinutes,
  jamThreadsPassed,
} = require("../src/lib/publishThreads");

test("applyPlaceholders: replace brand + link, buang baris instruksi", () => {
  const out = applyPlaceholders("[Brand/Produk] mantap. link: [Link Affiliate]\n[instruksi]", {
    brand: "Weidenmann Urban",
    link: "https://s.shopee.co.id/abc",
  });
  assert.equal(out, "Weidenmann Urban mantap. link: https://s.shopee.co.id/abc");
});

test("applyPlaceholders: teks multi-baris dari kolom Sheet, placeholder di tengah kalimat", () => {
  const raw =
    "Gue pake sepatu ini tiap hari.\n\n" +
    "Ternyata [Brand/Produk] jadi paling sering dipake.\n" +
    "[catatan: hapus baris ini]";
  const out = applyPlaceholders(raw, { brand: "Weidenmann x Willy Winarko", link: "" });
  assert.equal(
    out,
    "Gue pake sepatu ini tiap hari.\n\nTernyata Weidenmann x Willy Winarko jadi paling sering dipake."
  );
});

test("stripInstructionLines: buang baris kurung siku penuh (termasuk bersarang), simpan yang inline", () => {
  const out = stripInstructionLines("[Brand/Produk] keren.\n[script replace ...]\nbeneran keren.");
  assert.equal(out, "[Brand/Produk] keren.\nbeneran keren.");

  const nested = stripInstructionLines(
    'Teks produk asli.\n[script otomatis replace "[Brand/Produk]" pakai isi field Brand/Produk di atas]'
  );
  assert.equal(nested, "Teks produk asli.");
});

test("resolveLink: pakai kolom Link Affiliate apa adanya (tanpa UTM)", () => {
  assert.equal(
    resolveLink({ "Link Affiliate": "https://shopee.co.id/product/123/456" }),
    "https://shopee.co.id/product/123/456"
  );
  assert.equal(resolveLink({ "Link Affiliate": "  https://s.shopee.co.id/abc  " }), "https://s.shopee.co.id/abc");
  assert.equal(resolveLink({}), "");
});

test("jamToMinutes: serial time & string", () => {
  assert.equal(jamToMinutes(0.7916666666666666), 19 * 60); // serial 19:00
  assert.equal(jamToMinutes("19:00"), 19 * 60);
  assert.equal(jamToMinutes("19.00"), 19 * 60);
  assert.equal(jamToMinutes("07:30"), 7 * 60 + 30);
  assert.equal(jamToMinutes(""), null);
  assert.equal(jamToMinutes("bukan jam"), null);
});

test("jamThreadsPassed: kosong = anggap sudah lewat", () => {
  assert.equal(jamThreadsPassed(""), true);
  assert.equal(jamThreadsPassed(null), true);
  assert.equal(jamThreadsPassed("00:00"), true);
  assert.equal(jamThreadsPassed("23:59"), false);
});
