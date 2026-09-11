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

function buildPrompt(brief) {
  const jumlahAngle = Number(brief.jumlahAngle) > 0 ? Math.floor(Number(brief.jumlahAngle)) : null;
  const jumlahInstruction = jumlahAngle
    ? `WAJIB hasilkan PERSIS ${jumlahAngle} angle — tidak kurang, tidak lebih.`
    : `Kamu yang tentuin sendiri berapa jumlah angle yang paling masuk akal dari brief ini (minimal ${CONFIG.GEMINI_MIN_ANGLES}, maksimal ${CONFIG.GEMINI_MAX_ANGLES}), gak harus selalu maksimal.`;
  const briefLines = [
    line("Brand/Produk", brief.brand),
    line("Selling Point / Kelebihan Utama", brief.sellingPoint),
    line("Harga", brief.harga),
    line("Masalah yang Diselesaikan", brief.masalah),
    line("Momen/Skenario Pakai", brief.momen),
    line("Bahan & Spek Teknis", brief.bahanSpek),
    line("Ciri Visual/Vibe Desain", brief.visual),
  ].filter(Boolean).join("\n");

  return `Kamu adalah copywriter Threads buat konten affiliate sepatu/fashion (brand: Shoe Police / NSP).
Tugas kamu: dari SATU brief produk di bawah, hasilkan BEBERAPA "angle" (sudut pandang) konten yang beda-beda.
${jumlahInstruction}
Gak perlu maksa pakai poin brief yang kosong di bawah.

=== BRIEF ===
${briefLines}
=============

Format tiap angle = 3 bagian teks buat 3 post Threads berantai:
1. "utas1" (Hook) — pembuka yang narik perhatian, JANGAN jualan langsung di kalimat pertama.
2. "utas2" (Produk) — isi/pembahasan produk, natural, gak kaku kayak iklan.
3. "reply" (Link) — ajakan cek link, singkat.

ATURAN KETAT:
- Setiap nyebut nama brand/produk, pakai literal text "[Brand/Produk]" (akan di-replace otomatis oleh sistem) — JANGAN tulis nama brand asli langsung di teks.
- Setiap nyebut link affiliate, pakai literal text "[Link Affiliate]" (akan di-replace otomatis) — JANGAN tulis link asli.
- JANGAN pakai placeholder lain selain dua di atas.
- Tiap teks (utas1/utas2/reply) MAKSIMAL 480 karakter (batas keras platform 500, sisain jarak aman).
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
    "utas2": "...",
    "reply": "..."
  }
]`;
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
    const reply = String(a.reply || "").trim();
    const catatan = String(a.catatan_angle || `Angle ${i + 1}`).trim();
    const pilar = String(a.pilar || "").trim();
    const segmen = String(a.segmen || "").trim();
    if (!utas1 || !utas2 || !reply) {
      throw new Error(`Angle #${i + 1} dari Gemini ada bagian kosong (utas1/utas2/reply).`);
    }
    return { catatan_angle: catatan, pilar, segmen, utas1, utas2, reply };
  });
}

module.exports = { generateAnglesFromBrief, buildPrompt };
