# Checklist DPD Monitoring — Dokumentasi Project

> File ini adalah "single source of truth" ringkas untuk seluruh project. Simpan bersama
> `index.html`, `Code.gs`, dan `SETUP.md` supaya siapa pun (termasuk kamu sendiri 6 bulan
> lagi, atau Claude di sesi baru) bisa langsung paham konteksnya tanpa scroll ulang chat.

## 1. Apa project ini

Aplikasi web mobile-first untuk **checklist kondisi rak gudang** (per Zona → Line → Rak →
Shelf), dipakai petugas untuk memeriksa rak "Aman" vs "Bermasalah", mencatat temuan detail
(kategori, sub-kategori, catatan, foto), dan menampilkan dashboard kepatuhan (compliance)
mingguan ke admin. Bahasa UI: Indonesia. Style visual: neo-brutalist (hardline border tebal,
warna cream/orange/yellow, font Poppins).

## 2. Arsitektur

```
[index.html]  <-- static frontend, 1 file, vanilla JS + Tailwind CDN
     |  fetch (GET query string / POST text-plain JSON)
     v
[Code.gs]     <-- Google Apps Script, deployed as Web App (doGet/doPost)
     |
     v
[Google Sheet] <-- database: 5 sheet (MasterKategori, MasterZona, Administrator,
                    Checklist, Temuan) + folder Drive untuk foto temuan
```

- **Tidak ada server terpisah.** Semua backend = 1 Google Apps Script project yang attach ke
  1 Google Sheet, dideploy sebagai Web App URL (`/exec`).
- **Frontend statis** — bisa dibuka langsung dari file lokal, atau di-host di mana saja
  (Netlify, GitHub Pages, dst). Tidak butuh build step.
- **Demo mode otomatis**: kalau `APPS_SCRIPT_URL` di `index.html` masih placeholder, app
  jalan pakai data dummy in-memory (`DEMO_ZONA`, `DEMO_KATEGORI`, `DEMO_TEMUAN`) — jadi UI
  tetap bisa dites tanpa backend nyata.

## 3. Struktur file

| File | Isi |
|---|---|
| `index.html` | Seluruh frontend: 4 halaman (Login, Dashboard, Checklist, Detail Temuan), bottom nav, semua CSS & JS inline dalam 1 file. |
| `Code.gs` | Router `doGet`/`doPost`, fungsi CRUD ke Sheet, `setupSheets()` untuk seed data awal, simpan foto ke Drive. |
| `SETUP.md` | Panduan langkah demi langkah: buat Sheet → tempel Code.gs → run `setupSheets` → deploy Web App → tempel URL ke index.html → (opsional) setup Google OAuth login. |
| `PROJECT.md` | File ini. |

## 4. Model data (Google Sheet)

- **MasterKategori**: `Kategori | SubKategori` — sumber dropdown kategori temuan.
- **MasterZona**: `Zona | Line | Rak | Shelf` — sumber layout gudang. Data seed saat ini
  mencakup Zona 9–15 dengan susunan Line berbeda per zona (lihat objek `layout` di
  `setupSheets()` dalam `Code.gs`), total ±190 posisi rak.
- **Administrator**: `Username | Password | Nama` — login admin, password **plain text**
  (belum production-grade). Default seed: `admin` / `admin123`.
- **Checklist**: `Timestamp | Zona | Line | Rak | Status | Petugas` — log setiap kali rak
  diperiksa (OK/NOK). Dashboard menghitung compliance dari status **terbaru per rak** dalam
  7 hari terakhir.
- **Temuan**: `Timestamp | Zona | Line | Rak | Shelf | Kategori | SubKategori | Catatan |
  FotoURL | Petugas | Status` — detail temuan per shelf, foto disimpan di folder Drive
  "Checklist DPD - Foto Temuan", link disimpan sebagai `FotoURL`.

## 5. Endpoint backend (`Code.gs`)

`doGet(e)` — via query string `?action=...`
- `masterKategori`, `masterZona` — ambil data master.
- `dashboard` — hitung compliance minggu ini, zona terbaik/terlemah, NOK count, pending, tabel per zona.
- `temuan&from=&to=&zona=` — list temuan dengan filter tanggal/zona.
- `adminLogin&username=&password=` — cek kredensial ke sheet Administrator.

`doPost(e)` — body JSON via `text/plain` (menghindari CORS preflight)
- `submitInspection` — simpan hasil checklist rak (Checklist sheet) + temuan sekaligus (Temuan sheet + upload foto ke Drive).
- `verifyGoogleToken` — verifikasi id_token dari Google Sign-In via endpoint tokeninfo Google.

## 6. Alur UI utama

1. **Login** — Administrator (username/password ke sheet) ATAU Google Sign-In (kalau
   `GOOGLE_CLIENT_ID` diisi) ATAU tombol "Lewati Login" (mode testing).
2. **Dashboard** — gauge arc compliance minggu ini, kartu zona terbaik/terlemah/NOK/pending,
   quick filter zona, tabel OK/NOK/% per zona.
3. **Checklist** — input/pilih Line → Zona ter-auto-fill → grid tombol Rak:
   - **Tap** = toggle Aman (hijau) ⇄ kosong (putih)
   - **Tahan 800ms (hold)** = tandai Bermasalah (merah, badge "!")
   - Tap lagi pada rak Bermasalah = reset ke kosong
   - Begitu ada rak Bermasalah → panel **Input Temuan** otomatis muncul: pilih shelf
     (multi-select 1–5) per rak bermasalah → tiap kombinasi rak+shelf jadi 1 "slide" form
     (kategori, sub-kategori, catatan, foto) yang bisa dinavigasi dengan tombol ←/→.
   - Tombol **Posting** → validasi line valid, minimal 1 rak diperiksa, semua slide temuan
     lengkap kategori+sub-kategori → kirim ke backend (`submitInspection`) atau simpan ke
     `DEMO_TEMUAN` kalau demo mode.
4. **Detail Temuan** — filter rentang tanggal (dari/sampai) → list kartu temuan (foto,
   kategori/sub, lokasi, catatan, petugas, waktu).

## 7. Status fitur (per breakdown terakhir)

**Selesai & sesuai brief:**
- Master Kategori & Master Zona (seed otomatis Zona 9–15)
- Login Administrator (sheet) + Google Sign-In
- Dashboard: gauge compliance real dari data Checklist, zona terbaik/terlemah, NOK, pending review, quick filter + tabel
- Checklist: line dropdown+manual, zona auto-fill, rak tap=aman/hold=bermasalah/tap lagi=reset
- Input Temuan: auto-muncul, multi-shelf via slide, kategori/subkategori dari master, upload foto, counter, posting
- Detail Temuan: list + filter tanggal
- Database Google Sheets via Apps Script Web App

**Belum selesai / perlu diperbaiki (in progress):**
- **Fitur Trend** — brief awal minta grafik tren kepatuhan (mis. line chart 4 minggu
  terakhir) selain gauge arc; sempat hilang saat rombak ke versi Google Sheets.
- **Foto di Detail Temuan** — URL `drive.google.com/uc?id=...` kadang tidak konsisten tampil
  sebagai `<img>` langsung karena kebijakan Google Drive; perlu format thumbnail yang lebih
  reliable, idealnya dikonfirmasi setelah tes dengan Drive asli.
- **Belum di-test end-to-end** dengan backend Google Sheets asli (deploy Apps Script, coba
  tap/hold di HP asli lintas browser).

**Belum dibangun (sesuai brief, statusnya "bisa dikembangkan nanti"):**
- Forgot password & create account — masih placeholder `alert()`, belum ada form
  reset/daftar sungguhan.
- Keamanan password admin — masih plain text di sheet, cukup untuk internal, belum
  production-grade (butuh hashing kalau mau ditingkatkan).

## 8. Cara lanjutkan development

1. Buka `index.html`, `Code.gs` di editor.
2. Untuk fitur backend baru: tambah `case` baru di `doGet`/`doPost` di `Code.gs`, lalu
   **Deploy > Manage deployments > Edit (pensil) > Version: New version > Deploy** supaya
   perubahan aktif di URL yang sama (tidak perlu re-paste URL ke index.html).
3. Untuk fitur frontend baru: edit `index.html` langsung, tidak perlu build/compile apa pun.
4. Selalu jaga supaya app tetap bisa jalan di **demo mode** (tanpa `APPS_SCRIPT_URL` valid)
   agar mudah dites cepat sebelum deploy ke backend asli.
