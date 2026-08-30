# threads-affiliate-automation

Automasi konten affiliate di **Threads**, personal use. Alurnya:

```
Google Doc (sumber utama konten + metadata)
        │  scripts/run-sync.js  (Docs → Sheet, match by "Judul Konten")
        ▼
Google Sheet "Threads Affiliate" (approval + operasional + hasil)
        │  scripts/run-publish.js  (state machine, cron tiap 15 menit)
        ▼
Threads  →  3 post berantai:
        Utas 1 (hook, text)  ──reply──▶  Utas 2 (produk + gambar dari Drive)  ──reply──▶  Reply (link affiliate)
        │  scripts/run-insights.js  (cron tiap 3 jam)
        ▼
Sheet: Views Utas 1/2, Reply Rate (%)
```

Template sumbernya: `Template_Konten_Threads_Affiliate_v2.docx` + `Tracker_Threads_Affiliate_v2.xlsx`.

## State machine (kolom `STATUS THREADS`)

| STATUS | Aksi script | STATUS berikutnya |
|---|---|---|
| `Acc` (diisi manual setelah approval) | post Utas 1 (kalau `Jam Threads`/`Tanggal Upload` sudah lewat) | `Utas 1 Posted` |
| `Utas 1 Posted` | tunggu `Jeda Utas 2 (menit)`, lalu post Utas 2 (reply ke Utas 1, + gambar) | `Utas 2 Posted` |
| `Utas 2 Posted` | post Reply link (reply ke Utas 2) | `Published` |
| error di step mana pun | tulis pesan ke `Catatan` | `Gagal` |

Jeda antar-utas dihitung dari timestamp (`TS Utas 1`), bukan `sleep`, jadi aman walau GitHub Actions jalan per 15 menit.

## Placeholder yang di-replace otomatis saat publish

- `[Brand/Produk]` → kolom `Brand/Produk`
- `[Link Affiliate]` → kolom `UTM Link Affiliate` (kalau ada) atau `Link Affiliate`
- Baris yang isinya **seluruhnya** dalam kurung siku (mis. `[script otomatis replace ...]`) dibuang.

## Gambar

Nama file di folder Drive: `<Judul Konten> 1.jpg`, `<Judul Konten> 2.jpg`, dst (`.jpg/.jpeg/.png/.webp`).
- 1 gambar → post IMAGE
- ≥2 gambar → CAROUSEL (maks 20)
- 0 gambar → text only

> **Folder Drive gambar HARUS di-share "Anyone with the link → Viewer"**, karena Threads API men-fetch gambar lewat URL publik (`https://drive.google.com/uc?export=download&id=...`).

## Setup

### 1. Google service account
1. Buat service account + JSON key.
2. Aktifkan **Google Sheets API**, **Google Drive API**, **Google Docs API**.
3. Share ke email service account:
   - Google Doc konten → Viewer
   - Google Sheet tracker → **Editor**
   - Folder Drive gambar → Viewer (dan folder itu juga "anyone with link")

### 2. Threads API
Sudah punya Meta app + token. Buat long-lived token + ambil user id:

```bash
THREADS_APP_SECRET=xxx SHORT_LIVED_TOKEN=yyy npm run get-token
```

Output `THREADS_ACCESS_TOKEN` (60 hari, auto-refresh tiap run) dan `THREADS_USER_ID`.
Scope token yang dibutuhkan: `threads_basic`, `threads_content_publish`, `threads_manage_insights`.

### 3. Lokal
```bash
cp .env.example .env      # isi semua nilai
npm install
npm run sync              # Docs → Sheet
npm run publish           # sync + jalankan state machine
npm run insights
```

### 4. GitHub Actions
Set repo secrets:

| Secret | Isi |
|---|---|
| `THREADS_GOOGLE_SERVICE_ACCOUNT_KEY` | JSON service account (satu baris) |
| `THREADS_CONTENT_DOC_ID` | ID Google Doc |
| `THREADS_TRACKER_SPREADSHEET_ID` | ID Google Sheet |
| `THREADS_DRIVE_IMAGE_FOLDER_ID` | ID folder Drive gambar |
| `THREADS_SHEET_NAME` | `Threads Affiliate` |
| `THREADS_USER_ID` | dari `npm run get-token` |
| `THREADS_ACCESS_TOKEN` | long-lived token |
| `SECRETS_WRITE_PAT` | PAT (fine-grained, **Secrets: read/write** di repo ini) — buat nulis balik token yang di-refresh |

Workflow:
- `.github/workflows/threads-publish.yml` — sync + publish, tiap 15 menit
- `.github/workflows/threads-insights.yml` — insights, tiap 3 jam

Keduanya bisa dijalankan manual via **Run workflow**.

## Test

```bash
npm test
```

## Catatan / batasan

- Batas teks Threads 500 karakter per post — kalau lewat, baris jadi `Gagal`, pendekin di Docs.
- Rate limit Threads: 250 post / 24 jam per user.
- Belum ada reschedule dinamis (beda dengan sistem YouTube) — sekali `Published`, selesai. Kalau mau ulang, kosongkan kolom `POST ID *` + set `STATUS` balik ke `Acc`.
- `_rowNumber` di-track dari urutan baris; jangan sisipkan/hapus baris di tengah saat workflow lagi jalan.
