const test = require("node:test");
const assert = require("node:assert/strict");

const { parseContentDoc } = require("../src/lib/docsReader");
const { applyPlaceholders, resolveLink, stripInstructionLines } = require("../src/lib/publishThreads");

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

const SAMPLE = [
  "Template Konten Threads Affiliate",
  "Legend: biru = ... kuning = ...",
  "ISI KONTEN",
  "--- UTAS 1 (Hook) ---",
  "[Isi teks hook di sini.]",
  "--- UTAS 2 (Produk) ---",
  "[Isi teks produk di sini.]",
  "--- REPLY (Link) ---",
  "[Link affiliate + CTA]",
  "— akhir 1 blok konten, mulai blok baru di bawah —",
  'CONTOH TERISI — "Samba Look Lokal Ver"',
  "--- UTAS 1 (Hook) ---",
  "Semua orang ngejar Adidas Samba tahun ini.",
  "Padahal yang bikin orang suka itu siluetnya.",
  "--- UTAS 2 (Produk) ---",
  "[Brand/Produk] ini yang gue maksud. Siluet low-profile khas terrace sneaker.",
  '[script otomatis replace "[Brand/Produk]" pakai isi field Brand/Produk di atas]',
  "--- REPLY (Link) ---",
  "Buat yang mau nyobain look Samba tanpa drama restock — link pembelian 👇 [Link Affiliate]",
  "— akhir 1 blok konten —",
  "JUDUL: New Balance Lokal Rasa 550",
  "--- UTAS 1 (Hook) ---",
  "Hype 550 lagi kenceng.",
  "--- UTAS 2 (Produk) ---",
  "[Brand/Produk] punya siluet basket mirip.",
  "--- REPLY (Link) ---",
  "cek 👇 [Link Affiliate]",
];

test("parseContentDoc: fallback heading + JUDUL:, buang blok placeholder", () => {
  const blocks = parseContentDoc(fakeDoc(SAMPLE));
  assert.equal(blocks.length, 2);

  assert.equal(blocks[0].judul, "Samba Look Lokal Ver");
  assert.match(blocks[0].utas1, /Semua orang ngejar Adidas Samba/);
  assert.match(blocks[0].utas1, /Padahal yang bikin orang suka/);
  assert.match(blocks[0].utas2, /\[Brand\/Produk\] ini yang gue maksud/);
  assert.match(blocks[0].reply, /\[Link Affiliate\]/);

  assert.equal(blocks[1].judul, "New Balance Lokal Rasa 550");
  assert.equal(blocks[1].utas1, "Hype 550 lagi kenceng.");
});

test("stripInstructionLines: buang baris kurung siku penuh (termasuk bersarang), simpan yang inline", () => {
  const out = stripInstructionLines("[Brand/Produk] keren.\n[script replace ...]\nbeneran keren.");
  assert.equal(out, "[Brand/Produk] keren.\nbeneran keren.");

  const nested = stripInstructionLines(
    'Teks produk asli.\n[script otomatis replace "[Brand/Produk]" pakai isi field Brand/Produk di atas]'
  );
  assert.equal(nested, "Teks produk asli.");
});

test("applyPlaceholders: replace brand + link", () => {
  const out = applyPlaceholders("[Brand/Produk] mantap. link 👇 [Link Affiliate]\n[instruksi]", {
    brand: "Brand Lokal X",
    link: "https://x.test/go",
  });
  assert.equal(out, "Brand Lokal X mantap. link 👇 https://x.test/go");
});

test("resolveLink: pakai Link Affiliate apa adanya (tanpa UTM)", () => {
  assert.equal(
    resolveLink({ "Link Affiliate": "https://shopee.co.id/product/123/456" }),
    "https://shopee.co.id/product/123/456"
  );
  assert.equal(resolveLink({ "Link Affiliate": "  https://s.shopee.co.id/abc  " }), "https://s.shopee.co.id/abc");
  assert.equal(resolveLink({}), "");
});
