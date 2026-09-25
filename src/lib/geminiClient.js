/**
 * geminiClient.js
 * Wrapper tipis di atas @google/generative-ai buat generate beberapa "angle"
 * konten Threads dari satu baris brief produk. Selalu minta output JSON array
 * murni (tanpa markdown fence).
 */

const { GoogleGenAI } = require("@google/genai");
const { CONFIG } = require("./config");

/** Retry dengan backoff buat error transient Gemini (503 UNAVAILABLE / overload / 429). */
async function withGeminiRetry(fn, label) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err.message || "";
      const isRetryable =
        err.status === 503 ||
        err.status === 429 ||
        /UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED/i.test(msg);
      if (!isRetryable || attempt === maxAttempts) throw err;
      const waitMs = Math.min(20000, 1500 * Math.pow(2, attempt));
      console.log(`  (retry) ${label || "Gemini API"} kena error transient, percobaan ${attempt}/${maxAttempts}, tunggu ${Math.round(waitMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

function line(label, value) {
  const v = String(value || "").trim();
  return v ? `${label}: ${v}` : null;
}

/** "BAHAN_SPEK" -> "bahanSpek" (dipakai buat cocokin key BRIEF_COL <-> key categoryFields). */
function toCamelCase(constKey) {
  return constKey.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Label manusiawi per field kategori, key-nya camelCase (misal "teksturAroma").
 * Diturunkan otomatis dari CONFIG.CATEGORY_FIELDS + CONFIG.BRIEF_COL supaya labelnya
 * selalu konsisten sama nama kolom Sheet asli dan otomatis ikut kalau ada kategori/field baru.
 */
const CATEGORY_FIELD_LABELS = Object.fromEntries(
  [...new Set(Object.values(CONFIG.CATEGORY_FIELDS).flat())].map((key) => [
    toCamelCase(key),
    CONFIG.BRIEF_COL[key],
  ])
);

/** Baris-baris brief (brand, selling point, dst + field kategori), yang kosong di-skip. */
function buildBriefLines(brief) {
  const categoryFieldLines = Object.entries(brief.categoryFields || {}).map(
    ([key, value]) => line(CATEGORY_FIELD_LABELS[key] || key, value)
  );

  return [
    line("Brand/Produk", brief.brand),
    line("Selling Point / Kelebihan Utama", brief.sellingPoint),
    line("Harga", brief.harga),
    line("Masalah yang Diselesaikan", brief.masalah),
    line("Momen/Skenario Pakai", brief.momen),
    ...categoryFieldLines,
  ].filter(Boolean).join("\n");
}

/** Blok few-shot dari top performer (kosong kalau gak ada contoh). */
function buildExampleBlock(brief) {
  return (brief.topExamples && brief.topExamples.length)
    ? `\n=== CONTOH ANGLE YANG TERBUKTI PERFORMANYA BAGUS (kategori sama) ===\n` +
      brief.topExamples.map((ex, i) =>
        `Contoh ${i + 1}:\nUtas 1: ${ex.utas1}\nUtas 2: ${ex.utas2}\n`
      ).join("\n") +
      `=============\nPELAJARI pola gaya bahasa, struktur hook, dan cara penyampaian dari ` +
      `contoh-contoh di atas — TAPI JANGAN meniru/menyalin kalimat persis, buat angle yang ` +
      `BENAR-BENAR BARU dengan gaya serupa.\n`
    : "";
}

function buildPrompt(brief) {
  const jumlahAngle = Number(brief.jumlahAngle) > 0 ? Math.floor(Number(brief.jumlahAngle)) : null;
  const jumlahInstruction = jumlahAngle
    ? `WAJIB hasilkan PERSIS ${jumlahAngle} angle — tidak kurang, tidak lebih.`
    : `Kamu yang tentuin sendiri berapa jumlah angle yang paling masuk akal dari brief ini (minimal ${CONFIG.GEMINI_MIN_ANGLES}, maksimal ${CONFIG.GEMINI_MAX_ANGLES}), gak harus selalu maksimal.`;

  const briefLines = buildBriefLines(brief);
  const kategori = String(brief.kategori || "").trim();
  const exampleBlock = buildExampleBlock(brief);

  return `Kamu adalah copywriter Threads buat konten affiliate (akun: Shoe Police / NSP).
Tugas kamu: dari SATU brief yang dibahas di bawah, hasilkan BEBERAPA "angle" (sudut pandang) konten yang beda-beda.
${jumlahInstruction}
Gak perlu maksa pakai poin brief yang kosong di bawah.

Kategori Produk: ${kategori || "(tidak disebutkan)"}

=== BRIEF ===
${briefLines}
=============
${exampleBlock}
Format tiap angle = 2 bagian teks buat 2 post Threads berantai:
1. "utas1" (Hook) — pembuka yang narik perhatian, JANGAN jualan langsung di kalimat pertama.
2. "utas2" (Pembahasan) — isi/pembahasan yang dibahas, natural, gak kaku kayak iklan, WAJIB sertakan ajakan cek link di akhir teks menggunakan literal "[Link Affiliate]" (bukan post terpisah lagi seperti sebelumnya).

ATURAN KETAT:
- Setiap nyebut nama brand/produk, pakai literal text "[Brand/Produk]" (akan di-replace otomatis oleh sistem) — JANGAN tulis nama brand asli langsung di teks.
- Setiap nyebut link affiliate, pakai literal text "[Link Affiliate]" (akan di-replace otomatis) — JANGAN tulis link asli. Link HARUS muncul di dalam teks utas2 (bukan di post terpisah).
- JANGAN pakai placeholder lain selain dua di atas.
- Tiap teks (utas1/utas2) MAKSIMAL 480 karakter (batas keras platform 500, sisain jarak aman).
- Angle-angle harus beneran beda sudut pandang (misal: fokus ke masalah yang diselesaikan, fokus ke momen pakai, fokus ke spek teknis, fokus ke harga/value, dll — sesuaikan sama poin brief yang TERISI) — bukan cuma beda kalimat pembuka.
- Bahasa Indonesia santai, gaya media sosial, bukan bahasa formal/iklan kaku.

Selain itu, untuk tiap angle tentuin juga:
- "pilar" — kategori/pillar konten singkat (2-4 kata, misal: "Review Produk", "Edukasi", "Lifestyle", "Perbandingan Harga", "Testimoni")
- "segmen" — target audiens singkat (2-4 kata, misal: "Pekerja Kantoran", "Gen Z Pecinta Sneakers", "Mahasiswa")
Tentuin dua ini berdasar isi & fokus angle itu sendiri, boleh beda-beda antar angle dalam satu brief yang sama.

OUTPUT: HANYA JSON array valid, TANPA markdown code fence, TANPA teks penjelasan apa pun di luar JSON. Format persis:
[
  {
    "catatan_angle": "ringkasan sudut pandang angle ini (maks 10 kata)",
    "pilar": "...",
    "segmen": "...",
    "utas1": "...",
    "utas2": "..."
  }
]`;
}

/**
 * Varian buildPrompt buat generate PERSIS 1 angle per panggilan. Kalau
 * brief.existingAngleSummaries ada isinya, ringkasan angle yang udah dibuat
 * disisipin biar Gemini gak bikin angle yang mirip/duplikat.
 * Output yang diminta: JSON object tunggal (bukan array).
 */
function buildSingleAnglePrompt(brief) {
  const briefLines = buildBriefLines(brief);
  const kategori = String(brief.kategori || "").trim();
  const exampleBlock = buildExampleBlock(brief);

  const existing = (brief.existingAngleSummaries || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const existingBlock = existing.length
    ? `\n=== ANGLE YANG SUDAH DIBUAT (JANGAN BUAT YANG MIRIP INI) ===\n` +
      existing.map((s, i) => `${i + 1}. ${s}`).join("\n") +
      `\n=============\nBuat 1 angle BARU dengan sudut pandang BEDA dari semua di atas.\n`
    : "";

  return `Kamu adalah copywriter Threads buat konten affiliate (akun: Shoe Police / NSP).
Tugas kamu: dari SATU brief yang dibahas di bawah, hasilkan SATU "angle" (sudut pandang) konten.
WAJIB buat PERSIS 1 angle — tidak lebih.
Gak perlu maksa pakai poin brief yang kosong di bawah.

Kategori Produk: ${kategori || "(tidak disebutkan)"}

=== BRIEF ===
${briefLines}
=============
${exampleBlock}${existingBlock}
Format angle = 2 bagian teks buat 2 post Threads berantai:
1. "utas1" (Hook) — pembuka yang narik perhatian, JANGAN jualan langsung di kalimat pertama.
2. "utas2" (Pembahasan) — isi/pembahasan yang dibahas, natural, gak kaku kayak iklan, WAJIB sertakan ajakan cek link di akhir teks menggunakan literal "[Link Affiliate]" (bukan post terpisah).

ATURAN KETAT:
- Setiap nyebut nama brand/produk, pakai literal text "[Brand/Produk]" (akan di-replace otomatis oleh sistem) — JANGAN tulis nama brand asli langsung di teks.
- Setiap nyebut link affiliate, pakai literal text "[Link Affiliate]" (akan di-replace otomatis) — JANGAN tulis link asli. Link HARUS muncul di dalam teks utas2 (bukan di post terpisah).
- JANGAN pakai placeholder lain selain dua di atas.
- Tiap teks (utas1/utas2) MAKSIMAL 480 karakter (batas keras platform 500, sisain jarak aman).
- Angle harus punya sudut pandang yang jelas (misal: fokus ke masalah yang diselesaikan, fokus ke momen pakai, fokus ke spek teknis, fokus ke harga/value, dll — sesuaikan sama poin brief yang TERISI).
- Bahasa Indonesia santai, gaya media sosial, bukan bahasa formal/iklan kaku.

Selain itu, tentuin juga:
- "pilar" — kategori/pillar konten singkat (2-4 kata, misal: "Review Produk", "Edukasi", "Lifestyle", "Perbandingan Harga", "Testimoni")
- "segmen" — target audiens singkat (2-4 kata, misal: "Pekerja Kantoran", "Gen Z Pecinta Sneakers", "Mahasiswa")
Tentuin dua ini berdasar isi & fokus angle itu sendiri.

OUTPUT: HANYA satu JSON object valid (BUKAN array), TANPA markdown code fence, TANPA teks penjelasan apa pun di luar JSON. Format persis:
{
  "catatan_angle": "ringkasan sudut pandang angle ini (maks 10 kata)",
  "pilar": "...",
  "segmen": "...",
  "utas1": "...",
  "utas2": "..."
}`;
}

function stripJsonFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function generateAnglesFromBrief(brief) {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const prompt = buildPrompt(brief);
  const result = await withGeminiRetry(
    () => ai.models.generateContent({ model: CONFIG.GEMINI_MODEL, contents: prompt }),
    "generateContent"
  );
  const rawText = result.text;
  const cleaned = stripJsonFence(rawText);

  let angles;
  try {
    angles = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Gagal parse JSON dari Gemini: ${e.message}\n--- Raw response ---\n${rawText}`);
  }

  if (!Array.isArray(angles) || !angles.length) {
    throw new Error(`Gemini tidak menghasilkan array angle yang valid.\n--- Raw response ---\n${rawText}`);
  }

  const jumlahAngle = Number(brief.jumlahAngle) > 0 ? Math.floor(Number(brief.jumlahAngle)) : null;
  if (jumlahAngle && angles.length !== jumlahAngle) {
    throw new Error(`Diminta persis ${jumlahAngle} angle, Gemini malah hasilkan ${angles.length}. Coba generate ulang.`);
  }

  return angles.map((a, i) => {
    const utas1 = String(a.utas1 || "").trim();
    const utas2 = String(a.utas2 || "").trim();
    const catatan = String(a.catatan_angle || `Angle ${i + 1}`).trim();
    const pilar = String(a.pilar || "").trim();
    const segmen = String(a.segmen || "").trim();
    if (!utas1 || !utas2) {
      throw new Error(`Angle #${i + 1} dari Gemini ada bagian kosong (utas1/utas2).`);
    }
    return { catatan_angle: catatan, pilar, segmen, utas1, utas2 };
  });
}

/** Generate PERSIS 1 angle (object tunggal), dengan konteks angle yang udah dibuat sebelumnya. */
async function generateOneAngle(brief) {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const prompt = buildSingleAnglePrompt(brief);
  const result = await withGeminiRetry(
    () => ai.models.generateContent({ model: CONFIG.GEMINI_MODEL, contents: prompt }),
    "generateContent (1 angle)"
  );
  const rawText = result.text;
  const cleaned = stripJsonFence(rawText);

  let angle;
  try {
    angle = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Gagal parse JSON dari Gemini: ${e.message}\n--- Raw response ---\n${rawText}`);
  }

  if (!angle || typeof angle !== "object" || Array.isArray(angle)) {
    throw new Error(`Gemini tidak menghasilkan JSON object angle yang valid.\n--- Raw response ---\n${rawText}`);
  }

  const utas1 = String(angle.utas1 || "").trim();
  const utas2 = String(angle.utas2 || "").trim();
  const catatan = String(angle.catatan_angle || "Angle").trim();
  const pilar = String(angle.pilar || "").trim();
  const segmen = String(angle.segmen || "").trim();
  if (!utas1 || !utas2) {
    throw new Error(`Angle dari Gemini ada bagian kosong (utas1/utas2).`);
  }
  return { catatan_angle: catatan, pilar, segmen, utas1, utas2 };
}

module.exports = {
  generateAnglesFromBrief,
  buildPrompt,
  toCamelCase,
  generateOneAngle,
  buildSingleAnglePrompt,
};
