# threads-affiliate-automation

Automasi konten affiliate di **Threads**, personal use. **Satu sumber data: Google Sheet
"JADWAL THREADS".** Input & approval semua dari Google Sheets app (di HP). Google Docs
sudah tidak dipakai.

```
Google Sheet "JADWAL THREADS"
   = SEMUA data: metadata (Pilar/Brand/Link/Jam) + DRAFT teks (Utas 1/2/Reply)
     + approval (STATUS) + hasil (POST ID, Views)
        │  scripts/run-publish.js  (baca baris STATUS "Acc")
        ▼
Threads  →  3 post berantai:
   Utas 1 (hook, text)  ──reply──▶  Utas 2 (produk + gambar Drive)  ──reply──▶  Reply (link affiliate)
        │  scripts/run-insights.js
        ▼
Sheet: Views Utas 1/2, Reply Rate (%)
```

Gambar tetap dari folder **Google Drive "THREADS UPLOAD"** (upload manual dari HP),
matching nama file `<Judul Konten> 1.jpg`, `<Judul Konten> 2.jpg`, dst.

## Kolom Sheet (tab **"JADWAL THREADS"**, header **baris 3** — baris 1 legend, baris 2 label grup)

Urutan fisik sekarang:

```
Tanggal Upload · Judul Konten · Pilar · Segmen · Brand/Produk · Brand Referensi ·
Link Affiliate · Jam Threads · Catatan Angle · Utas 1 (Hook) · Utas 2 (Produk) ·
Reply (Link) · STATUS THREADS · Jeda Utas 2 (menit) · Catatan ·
POST ID Utas 1 · POST ID Utas 2 · POST ID Reply Link ·
Views Utas 1 · Views Utas 2 · Reply Rate (%)
```

Script baca kolom **berdasarkan nama header** (urutan bebas). Yang dipakai script:

| Kolom | Dipakai untuk |
|---|---|
| `Judul Konten` | matching nama file gambar di Drive |
| `Brand/Produk` | isi placeholder `[Brand/Produk]` di teks |
| `Link Affiliate` | isi placeholder `[Link Affiliate]` — dipakai apa adanya (tanpa UTM) |
| `Jam Threads` | jam paling awal Utas 1 boleh keluar (WIB). Kosong = langsung. Terima `19:00` atau serial time |
| `Utas 1 (Hook)` / `Utas 2 (Produk)` / `Reply (Link)` | **draft teks** yang diposting |
| `STATUS THREADS` | approval + hasil (lihat bawah) |
| `Jeda Utas 2 (menit)` | jeda Utas 1 → Utas 2 (default 5, maks 30) |
| `Catatan` | log hasil / pesan error (ditulis script) |
| `POST ID *`, `Views *`, `Reply Rate (%)` | hasil (ditulis script) |

Kolom `Tanggal Upload`, `Segmen`, `Brand Referensi`, `Catatan Angle` = referensi manual,
tidak disentuh script.

## Alur STATUS THREADS

| STATUS | Aksi script | STATUS berikutnya |
|---|---|---|
| *(kosong)* | — (nunggu approval) | — |
| `Acc` (diisi manual dari Sheets app) | kalau `Jam Threads` sudah lewat: post 3 utas berantai (Utas 1 → jeda → Utas 2 + gambar → Reply link) | `Uploaded` |
| `Uploaded` | selesai | — |
| error di step mana pun | tulis pesan ke `Catatan` | `Gagal` |

- **Satu baris per run.** Baris berikutnya diproses run cron selanjutnya (`*/5` menit).
- Jeda Utas 1 → Utas 2 pakai `sleep` dalam proses (bukan state antar-run), jadi 1 run =
  1 konten utuh. Kalau isi kolom `Jeda` > 30, dibatasi ke 30 menit.
- **Retry setelah `Gagal`:** kosongkan kolom `POST ID *` yang mau diulang, set `STATUS`
  balik ke `Acc`. Step yang `POST ID`-nya masih keisi akan di-skip (tidak dobel-post).

## Placeholder yang di-replace otomatis saat publish

- `[Brand/Produk]` → kolom `Brand/Produk`
- `[Link Affiliate]` → kolom `Link Affiliate` (apa adanya, tanpa tambahan apa pun)
- Baris yang isinya **seluruhnya** dalam kurung siku (mis. `[catatan: ...]`) dibuang.

## Gambar

Nama file di folder Drive: `<Judul Konten> 1.jpg`, `<Judul Konten> 2.jpg`, dst (`.jpg/.jpeg/.png/.webp`).
- 1 gambar → post IMAGE
- ≥2 gambar → CAROUSEL (maks 20)
- 0 gambar → text only

> **Folder Drive gambar HARUS di-share "Anyone with the link → Viewer"**, karena Threads API
> men-fetch gambar lewat URL publik (`https://drive.google.com/uc?export=download&id=...`).

## Setup

### 1. Google service account
1. Buat service account + JSON key.
2. Aktifkan **Google Sheets API** + **Google Drive API**.
3. Share ke email service account:
   - Google Sheet "JADWAL THREADS" → **Editor**
   - Folder Drive gambar → Viewer (dan folder itu juga "anyone with link → Viewer")

### 2. Threads API
Sudah punya Meta app + token. Buat long-lived token + ambil user id:

```bash
THREADS_APP_SECRET=xxx SHORT_LIVED_TOKEN=yyy npm run get-token
```

Output `THREADS_ACCESS_TOKEN` (60 hari) dan `THREADS_USER_ID`.
Scope: `threads_basic`, `threads_content_publish`, `threads_manage_insights`.

### 3. Lokal
```bash
cp .env.example .env       # isi nilainya
npm install
npm run check              # preflight: cek koneksi Sheets + Drive + Threads, TIDAK nge-post
npm run preview            # tampilkan persis teks yang akan diposting per baris "Acc"
DRY_RUN=1 npm run publish  # simulasi penuh — log apa yang AKAN diposting, tanpa nulis/post
npm run publish            # beneran
npm run insights
```

### 4. GitHub Actions
Repo secrets:

| Secret | Isi |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` dari JSON service account |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari JSON (boleh dengan `\n` literal) |
| `SHEET_ID` | ID Google Sheet "JADWAL THREADS" |
| `DRIVE_FOLDER_ID` | ID folder Drive gambar |
| `THREADS_USER_ID` | dari `npm run get-token` |
| `THREADS_ACCESS_TOKEN` | long-lived token |
| `THREADS_APP_SECRET` | app secret Meta (opsional, buat re-exchange manual) |
| `THREADS_SHEET_NAME` | *(opsional)* default `JADWAL THREADS` |
| `SECRETS_WRITE_PAT` | *(opsional)* PAT fine-grained, **Secrets: read/write** — biar token hasil refresh ke-simpan otomatis. Tanpa ini, refresh ulang `THREADS_ACCESS_TOKEN` manual tiap < 60 hari. |

> `DOC_ID` sudah **tidak dipakai** — boleh dihapus dari secrets.

Workflow:
- `threads-check.yml` — preflight, aman, tidak nge-post (manual)
- `threads-publish.yml` — publish; cron `*/5`, input `dry_run` (default **true**) untuk run manual
- `threads-insights.yml` — insights; cron `17 */3`
- `threads-admin.yml` — maintenance Sheet (manual): `set-cell` / `delete-column` / `rename-tab`

## Shopee Affiliate — conversion tracking

Tab baru **"CONVERSION REPORT"** di Sheet yang sama, diisi otomatis (`scripts/run-conversion-report.js`,
cron harian) dengan data `conversionReport` dari Shopee Affiliate Open API:

| Kolom | Isi |
|---|---|
| `Tanggal Order` | dari response `conversionReport` |
| `Order ID` / `Item ID` | dedup key — baris yang kombinasinya sudah ada di-skip, tidak di-append ulang |
| `Nama Produk`, `Qty`, `Harga`, `Komisi` | dari response |
| `Sub ID` | `{kodeProduk}\|{Row ID JADWAL THREADS}` — echo dari subId1/subId2 |
| `Status` | `Pending` / `Validated` / `Invalid` |
| `Tanggal Tarik` | timestamp run script (audit/debug) |

**Skema Sub-ID:** `subId1` = kode produk, `subId2` = kolom **`Row ID`** (baru, ditambah ke tab
`JADWAL THREADS`) — ID unik permanen per baris, supaya breakdown pillar/kanal/tanggal upload
tinggal di-join balik ke `JADWAL THREADS`, tanpa duplikasi info di tag.

> **Di luar scope script ini:** Shopee cuma ngembaliin subId1/subId2 kalau Link Affiliate yang
> dipakai waktu posting SUDAH ditag pakai `sub_id1`/`sub_id2` itu pas link-nya dibuat. Penandaan
> link (generate short link Shopee dengan sub-id, atau tempel manual) belum diimplementasi di sini.

Setup:

```bash
npm run backfill-row-id     # sekali jalan: tambah kolom "Row ID" + isi baris yang kosong
npm run shopee:introspect   # cek nama field conversionReport asli (field GraphQL belum
                             # diverifikasi resmi — lihat catatan di src/lib/conversionReport.js)
npm run conversion-report   # tarik manual sekali
```

Secrets tambahan buat GitHub Actions:

| Secret | Isi |
|---|---|
| `SHOPEE_AFFILIATE_APP_ID` | App ID Shopee Affiliate Open API |
| `SHOPEE_AFFILIATE_APP_SECRET` | Secret-nya |

Workflow: `shopee-conversion-report.yml` — cron harian (`30 1 * * *` UTC = 08:30 WIB), bisa
dipercepat lewat `cron` di file itu kalau perlu. `backfill-row-id` dan `shopee:introspect` juga
bisa dipanggil manual lewat `threads-admin.yml`.

## Test

```bash
npm test
```

## Catatan / batasan

- Batas teks Threads 500 karakter per post — kalau lewat, baris jadi `Gagal`, pendekin di Sheet.
- Rate limit Threads: 250 post / 24 jam per user.
- Sekali `Uploaded`, selesai. Kalau mau ulang: kosongkan `POST ID *` + set `STATUS` balik ke `Acc`.
- `_rowNumber` di-track dari urutan baris; jangan sisipkan/hapus baris di tengah saat workflow lagi jalan.
