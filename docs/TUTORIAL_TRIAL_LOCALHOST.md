# Tutorial Trial FHTBS ERP di Localhost

Panduan ini membawa Anda dari nol sampai sistem FHTBS ERP berjalan di komputer lokal (`localhost`) untuk keperluan trial/uji coba.

---

## 1. Prasyarat

| Perangkat | Versi minimum | Cek |
|---|---|---|
| Node.js | 20.x atau lebih baru (disarankan 22 LTS) | `node -v` |
| npm | 10.x atau lebih baru | `npm -v` |
| Git | versi berapa pun | `git --version` |

> Sistem tidak memerlukan database eksternal untuk trial — SQLite sudah tertanam di dalam paket (`better-sqlite3`).

## 2. Dapatkan Kode

```bash
git clone https://github.com/eghyal/FHTBS-ERP-V2.git
cd FHTBS-ERP-V2
```

Atau ekstrak bundle ZIP yang Anda terima, lalu masuk ke folder proyek.

## 3. Konfigurasi Environment

```bash
cp .env.example .env
```

Buka `.env` dan isi minimal:

```ini
# Wajib diisi agar sesi login tidak gugur setiap restart.
# Generate: openssl rand -base64 48   (atau isi string acak panjang manual)
JWT_SECRET=isi-dengan-string-acak-minimal-32-karakter

PORT=3000
```

> **Catatan keamanan:** bila `JWT_SECRET` dikosongkan, server tetap menyala dalam mode development dengan secret acak per-boot — tetapi semua sesi login akan hangus setiap kali server restart. Di production, server **menolak menyala** tanpa `JWT_SECRET`.

## 4. Instalasi Dependensi

```bash
npm install
```

Proses ini memakan waktu 2–5 menit tergantung koneksi.

## 5. Menjalankan Server

```bash
npm run dev
```

Tunggu sampai muncul:

```
[Server] SQLite database initialized successfully.
Server running on http://localhost:3000
```

Buka browser: **http://localhost:3000**

## 6. Akun Trial

Saat database pertama kali dibuat, sistem men-*seed* tiga akun inti:

| Username | Password awal | Peran |
|---|---|---|
| `Eghy` | `eghyalvandi` | FC — **god-mode** (akses penuh ke seluruh sistem) |
| `Ludy` | `bachtiarludy` | FC — **god-mode** (akses penuh ke seluruh sistem) |
| `admin` | terkunci acak | FC — tidak dapat login kecuali `SEED_ADMIN_PASSWORD` diisi di `.env` |

> Kata sandi disimpan sebagai hash bcrypt dan **hanya dibuat sekali**. Mengganti kata sandi tidak akan ditimpa ulang saat server restart.
> Password awal dapat dioverride sebelum run pertama lewat `SEED_EGHY_PASSWORD` / `SEED_LUDY_PASSWORD` di `.env`.

### Ganti kata sandi setelah login pertama

1. Login sebagai `Eghy` atau `Ludy`.
2. Klik avatar/nama di kanan atas → **Change Password**.
3. Isi kata sandi lama, kata sandi baru (min. 8 karakter), konfirmasi → **Simpan Kata Sandi**.

### Membuat akun pengguna lain

1. Pengguna baru mendaftar lewat halaman **Register** (status awal: `PENDING`).
2. Login sebagai `Eghy`/`Ludy` → menu persetujuan akun → **Approve**.
3. Pengguna langsung dapat login.

## 7. Lokasi Data

| Data | Lokasi |
|---|---|
| Database utama (SQLite) | `data/erp.db` |
| Database absensi | `data/hr_attendance.db` |
| File unggahan | `uploads/` |

Untuk mengulang trial dari nol: hentikan server, hapus folder `data/`, lalu `npm run dev` — skema dan akun inti dibuat ulang otomatis.

## 8. Build Production (opsional)

```bash
npm run build   # menghasilkan folder dist/ dan build/
npm start       # menyajikan hasil build di port 3000
```

## 9. Troubleshooting

| Gejala | Solusi |
|---|---|
| `EADDRINUSE: port 3000` | Ganti `PORT` di `.env`, mis. `PORT=3100` |
| Login gagal terus padahal kredensial benar | Pastikan `JWT_SECRET` tidak berubah di antara restart; hapus `data/erp.db` lalu ulangi bila database trial rusak |
| `npm install` gagal di modul `bcrypt`/`better-sqlite3` | Gunakan Node.js 20/22 LTS; di Windows instal "Desktop development with C++" (build tools) |
| Halaman putih setelah `npm start` | Jalankan `npm run build` dulu |
| Upload file ditolak | Hanya JPG/PNG/WebP/GIF/PDF maks. 25 MB, dan wajib login |

---

Selamat mencoba! Untuk membawa sistem ini ke server publik, lanjutkan ke **`PANDUAN_DEPLOY_HOSTINGER_SUPABASE.md`**.
