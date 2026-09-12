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
  BRIEF_SHEET_NAME: envOr(["THREADS_BRIEF_SHEET_NAME", "BRIEF_SHEET_NAME"], "BRIEF PRODUK"),
  // Header di baris 3 (baris 1 = legend warna, baris 2 = label grup kolom).
  HEADER_ROW: Number(envOr(["THREADS_HEADER_ROW", "HEADER_ROW"], "3")) || 3,
  BRIEF_HEADER_ROW: Number(envOr(["THREADS_BRIEF_HEADER_ROW", "BRIEF_HEADER_ROW"], "1")) || 1,

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
    ROW_ID: "Row ID", // ID unik permanen per baris — dipakai sbg subId2 saat tagging Link Affiliate (Shopee conversion tracking)
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


  // --- Kolom Sheet "BRIEF PRODUK" ---
  BRIEF_COL: {
    JUDUL: "Judul Konten",
    KATEGORI: "Kategori Produk",
    BRAND: "Brand/Produk",
    JUMLAH_ANGLE: "Jumlah Angle",
    SELLING_POINT: "Selling Point / Kelebihan Utama",
    HARGA: "Harga",
    MASALAH: "Masalah yang Diselesaikan",
    MOMEN: "Momen/Skenario Pakai",
    LINK: "Link Affiliate",
    STATUS_BRIEF: "Status Brief",
    CATATAN: "Catatan Brief",
    // --- Fashion & Wearables ---
    BAHAN_SPEK: "Bahan & Spek Teknis",
    VISUAL: "Ciri Visual/Vibe Desain",
    // --- Beauty & Personal Care ---
    KANDUNGAN: "Kandungan/Bahan Aktif",
    TEKSTUR_AROMA: "Tekstur & Aroma",
    CARA_PAKAI: "Cara Pakai",
    // --- Makanan & Minuman ---
    RASA_AROMA_TEKSTUR: "Rasa/Aroma/Tekstur",
    KOMPOSISI: "Komposisi/Bahan Baku",
    INFO_TAMBAHAN: "Info Tambahan",
    // --- Rumah, Perkakas & Elektronik ---
    FITUR_FUNGSI: "Fitur & Fungsi Utama",
    SPESIFIKASI_TEKNIS: "Spesifikasi Teknis",
    CARA_PAKAI_INSTALASI: "Cara Pakai/Instalasi",
    // --- Toko/Retail Rekomendasi ---
    KENAPA_TERPERCAYA: "Kenapa Terpercaya",
    PRODUK_UNGGULAN: "Produk Unggulan",
    LOKASI_AKSES: "Lokasi/Cara Akses",
    // --- Lainnya ---
    DETAIL_TAMBAHAN: "Detail Tambahan",
  },

  CATEGORIES: [
    "Fashion & Wearables",
    "Beauty & Personal Care",
    "Makanan & Minuman",
    "Rumah, Perkakas & Elektronik",
    "Toko/Retail Rekomendasi",
    "Lainnya",
  ],

  // Kolom BRIEF_COL (key) yang relevan untuk tiap kategori.
  CATEGORY_FIELDS: {
    "Fashion & Wearables": ["BAHAN_SPEK", "VISUAL"],
    "Beauty & Personal Care": ["KANDUNGAN", "TEKSTUR_AROMA", "CARA_PAKAI"],
    "Makanan & Minuman": ["RASA_AROMA_TEKSTUR", "KOMPOSISI", "INFO_TAMBAHAN"],
    "Rumah, Perkakas & Elektronik": ["FITUR_FUNGSI", "SPESIFIKASI_TEKNIS", "CARA_PAKAI_INSTALASI"],
    "Toko/Retail Rekomendasi": ["KENAPA_TERPERCAYA", "PRODUK_UNGGULAN", "LOKASI_AKSES"],
    "Lainnya": ["DETAIL_TAMBAHAN"],
  },

  // --- Nilai STATUS THREADS ---
  STATUS: {
    READY: "Acc", // siap diproses (diisi manual setelah approval, dari Google Sheets app di HP)
    DONE: "Uploaded", // 3 utas berhasil keposting
    ERROR: "Gagal", // ada step yang gagal — cek kolom Catatan
  },

  // --- Nilai Status Brief (tab BRIEF PRODUK) ---
  BRIEF_STATUS: {
    DONE: "Diproses", // sudah digenerate jadi baris JADWAL THREADS, jangan diproses ulang
    ERROR: "Gagal", // generate gagal — cek kolom Catatan Brief
  },

  // Jeda Utas 1 -> Utas 2: acak per-run antara MIN & MAX menit.
  // Kolom Sheet "Jeda Utas 2 (menit)" TIDAK dipakai manual lagi.
  JEDA_UTAS2_MIN_MENIT: 1,
  JEDA_UTAS2_MAX_MENIT: 2,

  // Placeholder di teks yang di-replace otomatis saat publish.
  PLACEHOLDER: {
    BRAND: "[Brand/Produk]",
    LINK: "[Link Affiliate]",
  },

  TIMEZONE: "Asia/Jakarta",

  // --- Gemini API (generate konten dari brief) ---
  GEMINI_MODEL: envOr(["GEMINI_MODEL"], "gemini-3.6-flash"),
  GEMINI_MIN_ANGLES: 3,
  GEMINI_MAX_ANGLES: 5,

  // --- Threads API ---
  THREADS_API_BASE: "https://graph.threads.net/v1.0",
  THREADS_MAX_TEXT: 500, // limit karakter per post Threads
  THREADS_CONTAINER_TIMEOUT_S: 90,

  // --- Shopee Affiliate: tab "CONVERSION REPORT" (di Sheet yang sama) ---
  CONVERSION_SHEET_NAME: envOr(["SHOPEE_CONVERSION_SHEET_NAME"], "CONVERSION REPORT"),
  CONVERSION_HEADER_ROW: 1,
  CONVERSION_COL: {
    TANGGAL_ORDER: "Tanggal Order",
    ORDER_ID: "Order ID",
    ITEM_ID: "Item ID",
    NAMA_PRODUK: "Nama Produk",
    SUB_ID: "Sub ID", // format "{kodeProduk}|{Row ID JADWAL THREADS}" — echo dari subId1|subId2 yang ditag di Link Affiliate
    QTY: "Qty",
    HARGA: "Harga",
    KOMISI: "Komisi",
    STATUS: "Status", // Pending / Validated / Invalid
    TANGGAL_TARIK: "Tanggal Tarik", // timestamp saat script narik data (audit/debug)
  },

  // --- Shopee Affiliate Open API (GraphQL) ---
  SHOPEE: {
    API_BASE: envOr(["SHOPEE_AFFILIATE_API_BASE"], "https://open-api.affiliate.shopee.co.id/graphql"),
    // App ID + Secret dari akun Shopee Affiliate (Open API). Wajib di-set via env, jangan commit ke repo.
    APP_ID_ENV: "SHOPEE_AFFILIATE_APP_ID",
    APP_SECRET_ENV: "SHOPEE_AFFILIATE_APP_SECRET",
    // Rentang tarik data per run: [now - LOOKBACK_DAYS, now]. Dedup di Sheet yang mastiin tidak dobel append,
    // jadi window ini cuma perlu >= jarak antar-run (dilebihin dikit buat jaga-jaga run yang skip/gagal).
    LOOKBACK_DAYS: Number(envOr(["SHOPEE_LOOKBACK_DAYS"], "3")) || 3,
    PAGE_LIMIT: 50, // max node per page conversionReport
  },
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

function assertGeminiConfig() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Environment variable 'GEMINI_API_KEY' belum di-set. Cek .env lokal.");
  }
}

function assertShopeeConfig() {
  const missing = [];
  if (!process.env[CONFIG.SHOPEE.APP_ID_ENV]) missing.push(CONFIG.SHOPEE.APP_ID_ENV);
  if (!process.env[CONFIG.SHOPEE.APP_SECRET_ENV]) missing.push(CONFIG.SHOPEE.APP_SECRET_ENV);
  if (missing.length) {
    throw new Error(`Config Shopee Affiliate belum lengkap, environment variable berikut kosong: ${missing.join(", ")}`);
  }
}

module.exports = { CONFIG, getSecret, assertCoreConfig, assertGeminiConfig, assertShopeeConfig };
