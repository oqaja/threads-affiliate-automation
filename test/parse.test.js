const test = require("node:test");
const assert = require("node:assert/strict");

const { parseContentDoc } = require("../src/lib/docsReader");
const { applyPlaceholders, resolveLink, stripInstructionLines } = require("../src/lib/publishThreads");

/** Bikin objek dokumen palsu ala Google Docs API dari daftar baris. */
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
  "Tanggal Upload",
  "[dd/mm/yyyy]",
  "Judul Konten",
  "[matching key - sama persis dengan Sheets]",
  "Pilar",
  "[Cerita Personal / Myth-busting]",
  "--- UTAS 1 (Hook) ---",
  "[Isi teks hook di sini.]",
  "--- UTAS 2 (Produk) ---",
  "[Isi teks produk di sini.]",
  "--- REPLY (Link) ---",
  "[Link affiliate + CTA]",
  "— akhir 1 blok konten, mulai blok baru di bawah —",
  "CONTOH TERISI — \"Samba Look Lokal Ver\"",
  "Tanggal Upload",
  "05/09/2026",
  "Judul Konten",
  "Samba Look Lokal Ver",
  "Pilar",
  "Myth-busting",
  "Segmen",
  "Sneakerhead budget-conscious",
  "Brand/Produk",
  "Brand Lokal X",
  "Brand Referensi",
  "Adidas Samba",
  "Link Affiliate",
  "https://affiliate-link.example/samba-lokal",
  "Jam Threads",
  "19:00",
  "Catatan Angle",
  "Fokus ke siluet, bukan logo brand",
  "--- UTAS 1 (Hook) ---",
  "Semua orang ngejar Adidas Samba tahun ini.",
  "Padahal yang bikin orang suka itu siluetnya.",
  "--- UTAS 2 (Produk) ---",
  "[Brand/Produk] ini yang gue maksud. Siluet low-profile khas terrace sneaker.",
  "[script otomatis replace \"[Brand/Produk]\" pakai isi field Brand/Produk di atas]",
  "--- REPLY (Link) ---",
  "Buat yang mau nyobain look Samba tanpa drama restock — link pembelian 👇 [Link Affiliate]",
];

test("parseContentDoc: buang blok placeholder, ambil blok contoh terisi", () => {
  const blocks = parseContentDoc(fakeDoc(SAMPLE));
  assert.equal(blocks.length, 1);
  const b = blocks[0];
  assert.equal(b.judul, "Samba Look Lokal Ver");
  assert.equal(b.tanggalUpload, "05/09/2026");
  assert.equal(b.pilar, "Myth-busting");
  assert.equal(b.brand, "Brand Lokal X");
  assert.equal(b.brandReferensi, "Adidas Samba");
  assert.equal(b.jamThreads, "19:00");
  assert.equal(b.linkAffiliate, "https://affiliate-link.example/samba-lokal");
  assert.match(b.utas1, /Semua orang ngejar Adidas Samba/);
  assert.match(b.utas1, /Padahal yang bikin orang suka/);
  assert.match(b.utas2, /\[Brand\/Produk\] ini yang gue maksud/);
  assert.match(b.reply, /\[Link Affiliate\]/);
});

test("stripInstructionLines: buang baris kurung siku penuh, simpan yang inline", () => {
  const out = stripInstructionLines("[Brand/Produk] keren.\n[script replace ...]\nbeneran keren.");
  assert.equal(out, "[Brand/Produk] keren.\nbeneran keren.");
});

test("applyPlaceholders: replace brand + link", () => {
  const out = applyPlaceholders(
    "[Brand/Produk] mantap. link 👇 [Link Affiliate]\n[instruksi]",
    { brand: "Brand Lokal X", link: "https://x.test/go" }
  );
  assert.equal(out, "Brand Lokal X mantap. link 👇 https://x.test/go");
});

test("resolveLink: gabung UTM suffix", () => {
  assert.equal(
    resolveLink({ "Link Affiliate": "https://x.test/p", "UTM Link Affiliate": "?utm_source=threads" }),
    "https://x.test/p?utm_source=threads"
  );
  assert.equal(
    resolveLink({ "Link Affiliate": "https://x.test/p?a=1", "UTM Link Affiliate": "?utm_source=threads" }),
    "https://x.test/p?a=1&utm_source=threads"
  );
  assert.equal(
    resolveLink({ "Link Affiliate": "https://x.test/p", "UTM Link Affiliate": "https://short.test/xyz" }),
    "https://short.test/xyz"
  );
});
