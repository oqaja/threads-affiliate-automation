# threads-affiliate-automation

Automasi konten affiliate di **Threads**, personal use. Alurnya:

```
Google Doc  = TEKS konten saja, per blok "JUDUL:" + 3 section
        │  scripts/run-sync.js  →  pastikan tiap JUDUL punya baris di Sheet
        ▼
Google Sheet tab "Tracker Threads Affiliate"  (header di BARIS 3)
   = metadata (Pilar/Brand/Link/Jam) diisi MANUAL + approval + hasil
        │  scripts/run-publish.js  (state machine)
        ▼
Threads  →  3 post berantai:
   Utas 1 (hook, text)  ──reply──▶  Utas 2 (produk + gambar Drive)  ──reply──▶  Reply (link affiliate)
        │  scripts/run-insights.js
        ▼
Sheet: Views Utas 1/2, Reply Rate (%)
```

**Google Doc format** (`docs/Template_Konten_Threads_Affiliate_v2.docx` sebagai acuan):

```
JUDUL: Samba Look Lokal Ver
--- UTAS 1 (Hook) ---
<teks hook, tutup dengan cliffhanger>
--- UTAS 2 (Produk) ---
<teks produk, pakai [Brand/Produk], TANPA link>
--- REPLY (Link) ---
link pembelian 👇 [Link Affiliate]
```

`JUDUL:` harus sama persis dengan `Judul Konten` di Sheet. (Tanpa baris `JUDUL:`,
judul diambil dari heading terakhir sebelum `--- UTAS 1 ---`, mis. `CONTOH TERISI — "..."`.)

## State machine (kolom `STATUS THREADS`)

| STATUS | Aksi script | STATUS berikutnya |
|---|---|---|
| `Acc` (diisi manual setelah approval) | post Utas 1 (kalau jam sekarang ≥ `Jam Threads` WIB; kosong = langsung) | `Utas 1 Posted` |
| `Utas 1 Posted` | tunggu `Jeda Utas 2 (menit)` sejak Utas 1, lalu post Utas 2 (reply ke Utas 1, + gambar) | `Utas 2 Posted` |
| `Utas 2 Posted` | post Reply link (reply ke Utas 2) | `Published` |
| error di step mana pun | tulis pesan ke `Catatan` | `Gagal` |

Jeda antar-utas dihitung dari `timestamp` post Utas 1 (diambil dari Threads API),
bukan `sleep` — aman walau GitHub Actions jalan per 5 menit. Default jeda 5 menit
(atau isi kolom `Jeda Utas 2 (menit)` per baris). Catatan: GitHub Actions cron
sering telat beberapa menit saat load tinggi, jadi jeda efektif ≈ 5–12 menit.

## Placeholder yang di-replace otomatis saat publish

- `[Brand/Produk]` → kolom `Brand/Produk`
- `[Link Affiliate]` → kolom `Link Affiliate` (apa adanya, tanpa tambahan apa pun)
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
cp .env.example .env       # isi semua nilai
npm install
npm run check              # preflight: cek semua koneksi, TIDAK nge-post apa pun
DRY_RUN=1 npm run publish  # simulasi penuh — log apa yang AKAN diposting, tanpa nulis/post
npm run publish            # beneran: sync + state machine
npm run insights
```

`npm run check` memvalidasi: creds service account, baca Doc + parse blok, baca/tulis
Sheet, akses folder Drive + status sharing publik, token Threads (`/me`), dan cross-check
Doc ↔ Sheet ↔ Drive per konten. `DRY_RUN=1` mem-bypass semua tulisan ke Sheet dan semua
call publish ke Threads (insights tetap jalan, read-only).

### 4. GitHub Actions
Repo secrets (nama yang dipakai sekarang):

| Secret | Isi |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` dari JSON service account |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari JSON (boleh dengan `\n` literal) |
| `DOC_ID` | ID Google Doc |
| `SHEET_ID` | ID Google Sheet |
| `DRIVE_FOLDER_ID` | ID folder Drive gambar |
| `THREADS_USER_ID` | dari `npm run get-token` |
| `THREADS_ACCESS_TOKEN` | long-lived token |
| `THREADS_APP_SECRET` | app secret Meta (opsional, buat re-exchange manual) |
| `SECRETS_WRITE_PAT` | *(opsional)* PAT fine-grained, **Secrets: read/write** di repo ini — biar token hasil refresh ke-simpan otomatis. Tanpa ini, refresh ulang `THREADS_ACCESS_TOKEN` manual tiap < 60 hari. |
| `THREADS_SHEET_NAME` | *(opsional)* default `Threads Affiliate` |

> Kode juga masih nerima nama panjang lama (`THREADS_CONTENT_DOC_ID`, dll) dan
> `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON inline) sebagai alternatif.

Workflow (semua **manual** dulu — `schedule` di-comment sampai 1x run sukses):
- `threads-check.yml` — preflight, aman, tidak nge-post
- `threads-publish.yml` — sync + publish; input `dry_run` (default **true**)
- `threads-insights.yml` — insights

Jalanin dari tab **Actions → pilih workflow → Run workflow**. Setelah publish sukses
sekali (dry-run lalu beneran), un-comment blok `schedule:` di kedua workflow.

## Test

```bash
npm test
```

## Catatan / batasan

- Batas teks Threads 500 karakter per post — kalau lewat, baris jadi `Gagal`, pendekin di Docs.
- Rate limit Threads: 250 post / 24 jam per user.
- Belum ada reschedule dinamis (beda dengan sistem YouTube) — sekali `Published`, selesai. Kalau mau ulang, kosongkan kolom `POST ID *` + set `STATUS` balik ke `Acc`.
- `_rowNumber` di-track dari urutan baris; jangan sisipkan/hapus baris di tengah saat workflow lagi jalan.
