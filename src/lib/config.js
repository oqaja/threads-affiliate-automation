/**
 * config.js
 * Semua konstanta sistem Threads Affiliate. Nilai yang perlu diisi sekali
 * (ID spreadsheet, ID Google Doc, ID folder Drive) diambil dari environment
 * variable supaya tidak perlu commit ID asli ke repo publik.
 */

function envOr(name, fallback) {
  const v = process.env[name];
  return v && String(v).trim() !== "" ? String(v).trim() : fallback;
}

const CONFIG = {
  // --- Sumber data ---
  // Google Doc = sumber utama konten + metadata (Pilar, Brand, Link, isi utas).
  CONTENT_DOC_ID: envOr("THREADS_CONTENT_DOC_ID", ""),

  // Google Sheet = tracker approval + operasional + hasil publish/insights.
  TRACKER_SPREADSHEET_ID: envOr("THREADS_TRACKER_SPREADSHEET_ID", ""),
  SHEET_NAME: envOr("THREADS_SHEET_NAME", "Threads Affiliate"),

  // Folder Drive berisi gambar. Nama file: "<Judul Konten> 1.jpg", "<Judul Konten> 2.jpg", dst.
  // Folder ini HARUS di-share "anyone with the link can view" supaya Threads API bisa fetch gambarnya.
  DRIVE_IMAGE_FOLDER_ID: envOr("THREADS_DRIVE_IMAGE_FOLDER_ID", ""),

  // --- Kolom Sheet (harus sama persis dengan header di baris 1) ---
  COL: {
    JUDUL: "Judul Konten", // matching key
    TANGGAL: "Tanggal Upload", // dd/mm/yyyy - sync dari Docs
    PILAR: "Pilar",
    BRAND: "Brand/Produk",
    BRAND_REF: "Brand Referensi",
    JAM: "Jam Threads", // HH:MM (WIB)
    LINK: "Link Affiliate",
    UTM: "UTM Link Affiliate",
    STATUS: "STATUS THREADS",
    JEDA_UTAS2: "Jeda Utas 2 (menit)",
    POST_ID_1: "POST ID Utas 1",
    POST_ID_2: "POST ID Utas 2",
    POST_ID_REPLY: "POST ID Reply Link",
    VIEWS_1: "Views Utas 1",
    VIEWS_2: "Views Utas 2",
    REPLY_RATE: "Reply Rate (%)",
    CATATAN: "Catatan",
  },

  // Kolom bantu yang dibuat otomatis oleh script (tambahkan sendiri di Sheet kalau mau lihat timestamp-nya).
  COL_INTERNAL: {
    TS_UTAS1: "TS Utas 1", // ISO timestamp Utas 1 dipublish (dipakai hitung jeda Utas 2)
  },

  // --- Nilai STATUS THREADS (state machine) ---
  STATUS: {
    READY: "Acc", // siap diproses (diisi manual setelah approval)
    UTAS1_DONE: "Utas 1 Posted",
    UTAS2_DONE: "Utas 2 Posted",
    PUBLISHED: "Published",
    ERROR: "Gagal",
  },

  DEFAULT_JEDA_UTAS2_MENIT: 15,

  // Placeholder di teks Doc yang di-replace otomatis saat publish.
  PLACEHOLDER: {
    BRAND: "[Brand/Produk]",
    LINK: "[Link Affiliate]",
  },

  TIMEZONE: "Asia/Jakarta",

  // --- Threads API ---
  THREADS_API_BASE: "https://graph.threads.net/v1.0",
  THREADS_MAX_TEXT: 500, // limit karakter per post Threads
  // Berapa lama menunggu media container "FINISHED" sebelum publish (detik).
  THREADS_CONTAINER_TIMEOUT_S: 90,
};

function getSecret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable '${name}' belum di-set. Cek GitHub Secrets atau file .env lokal.`);
  }
  return value;
}

function assertCoreConfig() {
  const missing = [];
  if (!CONFIG.CONTENT_DOC_ID) missing.push("THREADS_CONTENT_DOC_ID");
  if (!CONFIG.TRACKER_SPREADSHEET_ID) missing.push("THREADS_TRACKER_SPREADSHEET_ID");
  if (!CONFIG.DRIVE_IMAGE_FOLDER_ID) missing.push("THREADS_DRIVE_IMAGE_FOLDER_ID");
  if (missing.length) {
    throw new Error(`Config belum lengkap, environment variable berikut kosong: ${missing.join(", ")}`);
  }
}

module.exports = { CONFIG, getSecret, assertCoreConfig };
