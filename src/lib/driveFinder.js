/**
 * driveFinder.js
 * Cari file gambar di folder Drive berdasarkan konvensi nama "<Judul Konten> <n>.<ext>"
 * dan bangun URL publik yang bisa di-fetch Threads API.
 *
 * PENTING: folder Drive harus di-share "Anyone with the link -> Viewer" supaya
 * URL uc?export=download bisa diakses server Threads tanpa auth.
 */

const { CONFIG } = require("./config");

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

async function listImagesInFolder(drive) {
  const files = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${CONFIG.DRIVE_IMAGE_FOLDER_ID}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return files.filter((f) => IMAGE_EXT.test(f.name) || (f.mimeType || "").startsWith("image/"));
}

function baseName(name) {
  return name.replace(IMAGE_EXT, "").trim();
}

/** URL publik langsung ke bytes gambar. */
function publicImageUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Kembalikan daftar URL gambar untuk satu judul konten, terurut sesuai nomor.
 * "Samba Look Lokal Ver 1.jpg", "Samba Look Lokal Ver 2.jpg" -> [url1, url2]
 */
async function findImagesForTitle(drive, judul) {
  const target = judul.trim().toLowerCase();
  const files = await listImagesInFolder(drive);

  const matched = [];
  for (const f of files) {
    const base = baseName(f.name).toLowerCase();
    const m = base.match(/^(.*?)[\s_-]+(\d+)$/);
    if (m && m[1].trim() === target) {
      matched.push({ n: parseInt(m[2], 10), id: f.id, name: f.name });
    } else if (base === target) {
      matched.push({ n: 1, id: f.id, name: f.name });
    }
  }
  matched.sort((a, b) => a.n - b.n);
  return matched.map((x) => ({ url: publicImageUrl(x.id), name: x.name, id: x.id }));
}

module.exports = { findImagesForTitle, listImagesInFolder, publicImageUrl };
