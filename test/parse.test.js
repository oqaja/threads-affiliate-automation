const test = require("node:test");
const assert = require("node:assert/strict");

const { parseContentDoc } = require("../src/lib/docsReader");
const {
  applyPlaceholders,
  resolveLink,
  stripInstructionLines,
  jamToMinutes,
} = require("../src/lib/publishThreads");

/** Objek dokumen palsu ala Google Docs API dari daftar baris. */
function fakeDoc(lines) {
  return {
    body: {
      content: lines.map((line) => ({
        paragraph: { elements: [{ textRun: { content: line + "\n" } }] },
      })),
    },
  };
}

const EQ = "=".repeat(50);

// Format Doc "BRIEF THREADS" yang asli: metadata "Key | Value", judul "Judul Konten | X",
// blok dipisah baris "====", section pakai "--- UTAS 1/2 ---" / "--- REPLY ---".
const REAL_FORMAT = [
  "# Template Konten Threads Affiliate",
  "Legend: biru = ... kuning = ...",
  "Judul Konten | [matching key - sama persis dengan Sheets]",
  "Pilar | [Cerita Personal / Myth-busting]",
  "--- UTAS 1 (Hook) ---",
  "[Isi teks hook di sini.]",
  "--- UTAS 2 (Produk) ---",
  "[Isi teks produk di sini.]",
  "--- REPLY (Link) ---",
  "[Link affiliate + CTA]",
  "— akhir 1 blok konten —",
  EQ,
  "Judul Konten | Weidenmann - Commuting Harian",
  "Pilar | Cerita Personal",
  "Brand/Produk | Weidenmann Urban x Willy Winarko Hinterhalt 02",
  "Brand Referensi | Salomon XT-6",
  "Link Affiliate | https://s.shopee.co.id/gPi35xU8y",
  "Jam Threads | 19:00",
  "Catatan Angle | Jujur soal kekurangan",
  "--- UTAS 1 (Hook) ---",
  "Gue pake sepatu ini buat commuting tiap hari.",
  "Ternyata jadi paling sering dipake.",
  "--- UTAS 2 (Produk) ---",
  "Agak panas dikit, tapi grip-nya juara. [Brand/Produk], based on real pengalaman.",
  "--- REPLY (Link) ---",
  "Link pembelian: [Link Affiliate]",
  EQ,
  "Judul Konten | Weidenmann - Harga vs Value XT-6",
  "Pilar | Myth-busting",
  "--- UTAS 1 (Hook) ---",
  "Orang bilang mahal = bagus. Belum tentu.",
  "--- UTAS 2 (Produk) ---",
  "[Brand/Produk] harganya sepertiga, performa 90%.",
  "--- REPLY (Link) ---",
  "beli di sini: [Link Affiliate]",
];

test("parseContentDoc: format asli (Judul Konten | X, metadata Key|Value, ==== separator)", () => {
  const blocks = parseContentDoc(fakeDoc(REAL_FORMAT));
  assert.equal(blocks.length, 2); // blok template placeholder ke-drop
  assert.deepEqual(
    blocks.map((b) => b.judul),
    ["Weidenmann - Commuting Harian", "Weidenmann - Harga vs Value XT-6"]
  );
  assert.equal(
    blocks[0].utas1,
    "Gue pake sepatu ini buat commuting tiap hari.\n\nTernyata jadi paling sering dipake."
  );
  assert.match(blocks[0].utas2, /\[Brand\/Produk\], based on real pengalaman\.$/);
  assert.equal(blocks[0].reply, "Link pembelian: [Link Affiliate]");
  assert.ok(!blocks[0].reply.includes("="));
  assert.ok(!blocks[0].utas1.includes("Pilar |"));
});

test("stripInstructionLines: buang baris kurung siku penuh (termasuk bersarang), simpan yang inline", () => {
  const out = stripInstructionLines("[Brand/Produk] keren.\n[script replace ...]\nbeneran keren.");
  assert.equal(out, "[Brand/Produk] keren.\nbeneran keren.");

  const nested = stripInstructionLines(
    'Teks produk asli.\n[script otomatis replace "[Brand/Produk]" pakai isi field Brand/Produk di atas]'
  );
  assert.equal(nested, "Teks produk asli.");
});

test("applyPlaceholders: replace brand + link, buang baris instruksi", () => {
  const out = applyPlaceholders("[Brand/Produk] mantap. link: [Link Affiliate]\n[instruksi]", {
    brand: "Brand Lokal X",
    link: "https://s.shopee.co.id/abc",
  });
  assert.equal(out, "Brand Lokal X mantap. link: https://s.shopee.co.id/abc");
});

test("jamToMinutes: serial time & string", () => {
  assert.equal(jamToMinutes(0.7916666666666666), 19 * 60); // serial 19:00
  assert.equal(jamToMinutes("19:00"), 19 * 60);
  assert.equal(jamToMinutes("19.00"), 19 * 60);
  assert.equal(jamToMinutes("07:30"), 7 * 60 + 30);
  assert.equal(jamToMinutes(""), null);
  assert.equal(jamToMinutes("bukan jam"), null);
});

test("resolveLink: pakai Link Affiliate apa adanya (tanpa UTM)", () => {
  assert.equal(
    resolveLink({ "Link Affiliate": "https://shopee.co.id/product/123/456" }),
    "https://shopee.co.id/product/123/456"
  );
  assert.equal(resolveLink({ "Link Affiliate": "  https://s.shopee.co.id/abc  " }), "https://s.shopee.co.id/abc");
  assert.equal(resolveLink({}), "");
});
