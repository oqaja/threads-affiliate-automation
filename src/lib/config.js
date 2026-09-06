/**
 * config.js
 * Semua konstanta sistem Threads Affiliate.
 *
 * Arsitektur (disederhanakan): SATU sumber data = Google Sheet "JADWAL THREADS".
 * Semua kolom — termasuk draft teks Utas 1 / Utas 2 / Reply — ada di Sheet.
 * Google Docs SUDAH TIDAK DIPAKAI. Gambar tetap dari folder Google Drive.
 *
 * ID (spreadsheet, folder Drive) diambil dari environment variable supaya tidak
 * perlu commit ID asli ke repo publik.
 */

/** Ambil env pertama yang keisi dari daftar nama (alias didukung), atau fallback. */
function envOr(names, fallback) {
  for (const name of Array.isArray(names) ? names : [names]) {
    const v = process.env[name];
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  return fallback;
}

const CONFIG = {
  // --- Sumber data ---
  // Google Sheet = SATU-SATUNYA sumber: metadata + draft teks + approval + hasil.
  TRACKER_SPREADSHEET_ID: envOr(["THREADS_TRACKER_SPREADSHEET_ID", "SHEET_ID"], ""),
  SHEET_NAME: envOr(["THREADS_SHEET_NAME", "SHEET_NAME"], "JADWAL THREADS"),
  // Header di baris 3 (baris 1 = legend warna, baris 2 = label grup kolom).
  HEADER_ROW: Number(envOr(["THREADS_HEADER_ROW", "HEADER_ROW"], "3")) || 3,

  // Folder Drive berisi gambar. Nama file: "<Judul Konten> 1.jpg", "<Judul Konten> 2.jpg", dst.
  // Folder ini HARUS di-share "anyone with the link can view" supaya Threads API bisa fetch gambarnya.
  DRIVE_IMAGE_FOLDER_ID: envOr(["THREADS_DRIVE_IMAGE_FOLDER_ID", "DRIVE_FOLDER_ID"], ""),

  // --- Kolom Sheet "JADWAL THREADS" (dibaca by NAME, urutan kolom bebas) ---
  // Urutan fisik sekarang:
  //   Tanggal Upload · Judul Konten · Pilar · Segmen · Brand/Produk · Brand Referensi ·
  //   Link Affiliate · Jam Threads · Catatan Angle · Utas 1 (Hook) · Utas 2 (Produk) ·
  //   Reply (Link) · STATUS THREADS · Jeda Utas 2 (menit) · Catatan ·
  //   POST ID Utas 1 · POST ID Utas 2 · POST ID Reply Link ·
  //   Views Utas 1 · Views Utas 2 · Reply Rate (%)
  COL: {
    TANGGAL: "Tanggal Upload", // referensi manual, tidak dipakai script
    JUDUL: "Judul Konten", // matching key ke nama file gambar di Drive
    PILAR: "Pilar",
    SEGMEN: "Segmen", // referensi manual
    BRAND: "Brand/Produk", // isi "[Brand/Produk]" di teks
    BRAND_REF: "Brand Referensi",
    LINK: "Link Affiliate", // isi "[Link Affiliate]" di teks; dipakai apa adanya (tanpa UTM)
    JAM: "Jam Threads", // HH:MM (WIB) atau serial time — jam paling awal Utas 1 boleh keluar; kosong = langsung
    CATATAN_ANGLE: "Catatan Angle", // referensi manual
    UTAS1: "Utas 1 (Hook)", // DRAFT teks hook
    UTAS2: "Utas 2 (Produk)", // DRAFT teks produk
    REPLY: "Reply (Link)", // DRAFT teks reply link
    STATUS: "STATUS THREADS",
    JEDA_UTAS2: "Jeda Utas 2 (menit)",
    CATATAN: "Catatan", // log hasil / pesan error (ditulis script)
    POST_ID_1: "POST ID Utas 1",
    POST_ID_2: "POST ID Utas 2",
    POST_ID_REPLY: "POST ID Reply Link",
    VIEWS_1: "Views Utas 1",
    VIEWS_2: "Views Utas 2",
    REPLY_RATE: "Reply Rate (%)",
  },

  // --- Nilai STATUS THREADS ---
  STATUS: {
    READY: "Acc", // siap diproses (diisi manual setelah approval, dari Google Sheets app di HP)
    DONE: "Uploaded", // 3 utas berhasil keposting
    ERROR: "Gagal", // ada step yang gagal — cek kolom Catatan
  },

  DEFAULT_JEDA_UTAS2_MENIT: 5,
  // Batas atas sleep dalam-proses antara Utas 1 -> Utas 2 (jaga-jaga isi kolom kegedean).
  MAX_JEDA_SLEEP_MENIT: 30,

  // Placeholder di teks yang di-replace otomatis saat publish.
  PLACEHOLDER: {
    BRAND: "[Brand/Produk]",
    LINK: "[Link Affiliate]",
  },

  TIMEZONE: "Asia/Jakarta",

  // --- Threads API ---
  THREADS_API_BASE: "https://graph.threads.net/v1.0",
  THREADS_MAX_TEXT: 500, // limit karakter per post Threads
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
  if (!CONFIG.TRACKER_SPREADSHEET_ID) missing.push("SHEET_ID / THREADS_TRACKER_SPREADSHEET_ID");
  if (!CONFIG.DRIVE_IMAGE_FOLDER_ID) missing.push("DRIVE_FOLDER_ID / THREADS_DRIVE_IMAGE_FOLDER_ID");
  if (missing.length) {
    throw new Error(`Config belum lengkap, environment variable berikut kosong: ${missing.join(", ")}`);
  }
}

module.exports = { CONFIG, getSecret, assertCoreConfig };
