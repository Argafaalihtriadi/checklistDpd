# Checklist DPD Monitoring

Aplikasi web mobile-first untuk **checklist kondisi rak gudang** — petugas bisa periksa rak,
catat temuan (kategori, foto, catatan), dan lihat dashboard kepatuhan real-time.

## Fitur

- **Login** — Administrator (username/password), Google Sign-In, atau mode testing
- **Dashboard** — gauge compliance mingguan, zona terbaik/terlemah, quick filter
- **Checklist** — tap = aman, hold = bermasalah, auto-muncul form temuan per shelf
- **Multi-Petugas** — data pemeriksaan lengkap (history), laporan harian tampilkan status terkini
- **Detail Temuan** — filter tanggal, toggle "Semua Riwayat" / "Terbaru Saja"
- **Export** — PDF, CSV, Laporan Harian (gambar)
- **Dark Mode** & **Bahasa** (Indonesia / English)
- **Loading Animations** — spinner saat login, posting, export
- **Custom Modals** — alert/confirm tanpa native browser popup

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML + CSS + Vanilla JS, Tailwind CSS CDN, Google Fonts (Poppins) |
| Backend | Google Apps Script (Code.gs) |
| Database | Google Sheets (5 sheets) |
| CDN Libraries | jsPDF, jsPDF-AutoTable, html2canvas |
| Auth | Google Identity Services (OAuth2) |

## Arsitektur

```
index.html ──fetch──> Code.gs ──read/write──> Google Sheet
   |                                           |
   |   static file, tanpa build step           |  + Google Drive (foto)
   └── bisa dibuka langsung dari file lokal     └── deploy sebagai Web App
```

## Quick Start

### Frontend

Buka `index.html` langsung di browser — otomatis jalan dalam **demo mode** dengan data dummy.

### Backend

Lihat **[SETUP.md](SETUP.md)** untuk panduan lengkap:

1. Buat Google Sheet → tempel `Code.gs` → run `setupSheets()`
2. Deploy sebagai Web App → salin URL ke `index.html`
3. (Opsional) Setup Google OAuth Client ID

## Struktur File

| File | Isi |
|------|-----|
| `index.html` | Seluruh frontend (1 file, ~3100 baris) — 4 halaman, CSS, JS inline |
| `Code.gs` | Backend Apps Script — router, CRUD, upload foto ke Drive |
| `SETUP.md` | Panduan setup backend & deploy |
| `PROJECT.md` | Dokumentasi lengkap project (model data, endpoint, alur UI) |
| `README.md` | File ini |

## Model Data (Google Sheet)

| Sheet | Kolom | Keterangan |
|-------|-------|------------|
| MasterKategori | Kategori, SubKategori | Dropdown kategori temuan |
| MasterZona | Zona, Line, Rak, Shelf | Layout gudang (sumber grid rak & shelf) |
| Administrator | Username, Password, Nama | Login admin |
| Checklist | Timestamp, Zona, Line, Rak, Status, Petugas | Log pemeriksaan rak (OK/NOK) |
| Temuan | Timestamp, Zona, Line, Rak, Shelf, Kategori, SubKategori, Catatan, FotoURL, Petugas, Status | Detail temuan + foto |

## Multi-Petugas & Data History

Setiap pemeriksaan **selalu menambah data baru** (append-only) — tidak ada data yang dihapus.

- **Laporan Harian** — dedup by Line+Rak+Shelf, tampilkan temuan terkini
- **PDF / CSV** — tampilkan semua riwayat termasuk duplikat
- **Detail Temuan** — toggle "Semua Riwayat" / "Terbaru Saja"

## Status Fitur

| Fitur | Status |
|-------|--------|
| Login (Admin + Google + Testing) | Selesai |
| Dashboard compliance | Selesai |
| Checklist rak (tap/hold) | Selesai |
| Input temuan multi-shelf | Selesai |
| Multi-petugas + history | Selesai |
| Dark mode + Bahasa (ID/EN) | Selesai |
| Export PDF/CSV + Laporan Harian | Selesai |
| Loading animasi + custom modal | Selesai |
| Toggle Semua/Terbaru di Detail | Selesai |
| Trend grafik (line chart) | Bisa dikembangkan |
| Resolve temuan (open/closed) | Bisa dikembangkan |
| Forgot password | Bisa dikembangkan |

## Developed by

**Argaft** — [GitHub](https://github.com/Argafaalihtriadi)
