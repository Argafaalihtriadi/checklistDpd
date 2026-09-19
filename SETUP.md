# Setup Backend (Google Sheets + Apps Script)

## 1. Buat Spreadsheet
1. Buka [sheets.new](https://sheets.new) → beri nama misalnya **"Checklist DPD - Database"**.
2. Menu **Extensions > Apps Script**.
3. Hapus semua isi editor, tempel seluruh isi file **`Code.gs`** yang saya berikan.
4. Simpan (ikon disket / Ctrl+S).

## 2. Jalankan setup awal (sekali saja)
1. Di toolbar atas editor Apps Script, pilih fungsi **`setupSheets`** dari dropdown.
2. Klik **Run**. Pertama kali akan diminta izin akses (Authorize access) — pilih akun Google-mu, klik **Advanced > Go to (nama project) > Allow**.
3. Setelah selesai, akan muncul alert "Setup selesai!". Cek spreadsheet-mu — sekarang ada 5 sheet: `MasterKategori`, `MasterZona` (sudah terisi ±190 posisi rak sesuai data zona 9–15), `Administrator` (akun default `admin` / `admin123`), `Checklist`, `Temuan`.
4. **Ganti password admin default** di sheet `Administrator` sebelum dipakai produksi.

## 3. Deploy sebagai Web App
1. Klik **Deploy > New deployment**.
2. Klik ikon gear ⚙️ di samping "Select type" → pilih **Web app**.
3. Isi:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy**, izinkan akses lagi jika diminta.
5. **Salin "Web app URL"** — bentuknya seperti:
   `https://script.google.com/macros/s/XXXXXXXXXXXX/exec`
6. Tempel URL ini ke `index.html`, pada baris:
   ```js
   const APPS_SCRIPT_URL = "PASTE_WEB_APP_URL_DI_SINI";
   ```

> Setiap kali kamu **mengubah kode `Code.gs`**, kamu perlu **Deploy > Manage deployments > Edit (ikon pensil) > Version: New version > Deploy** supaya perubahan aktif di URL yang sama.

## 4. (Opsional) Aktifkan Login dengan Google
Kalau ingin tombol "Sign in with Google" berfungsi (untuk petugas biasa, bukan admin):

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project baru (atau pakai yang ada).
2. **APIs & Services > OAuth consent screen** → isi info dasar aplikasi, set User type **External**, tambahkan emailmu sebagai test user (kalau masih tahap testing).
3. **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Application type: **Web application**
   - Authorized JavaScript origins: isi domain tempat `index.html` akan diakses, misalnya `https://namadomainmu.com`. Untuk uji coba lokal, tambahkan juga `http://localhost` dan `http://127.0.0.1`.
4. Salin **Client ID** yang muncul, tempel ke `index.html`:
   ```js
   const GOOGLE_CLIENT_ID = "PASTE_CLIENT_ID_DI_SINI.apps.googleusercontent.com";
   ```
5. Jika `GOOGLE_CLIENT_ID` tidak diisi, tombol Google otomatis disembunyikan dan hanya login Administrator (username/password) yang aktif — aplikasi tetap berfungsi normal.

## 5. Cara menjalankan aplikasi
`index.html` adalah file statis biasa — cukup buka langsung di browser (double-click), atau upload ke hosting apa saja (Netlify, GitHub Pages, cPanel, dsb). Tidak perlu server backend tambahan karena semua data lewat Apps Script Web App di atas.

## Struktur data yang perlu kamu tahu
- **MasterKategori**: `Kategori | SubKategori` — tambah/ubah baris di sini untuk menambah pilihan kategori temuan.
- **MasterZona**: `Zona | Line | Rak | Shelf` — sumber data dropdown Line & grid Rak di halaman Checklist. Tambah baris untuk menambah zona/line/rak baru.
- **Administrator**: `Username | Password | Nama` — akun login admin. Password disimpan polos (plain text) di sheet ini — cukup untuk internal/testing, **bukan untuk keamanan tingkat produksi**. Kalau butuh lebih aman, beri tahu saya untuk ditingkatkan (hashing password, dsb).
- **Checklist**: log otomatis setiap kali rak diperiksa (OK/NOK) — dipakai untuk hitung persentase kepatuhan di Dashboard.
- **Temuan**: detail temuan yang di-posting dari halaman Checklist, termasuk link foto (tersimpan otomatis di folder Google Drive **"Checklist DPD - Foto Temuan"**).
