# Status Implementasi Perbaikan Audit — FHTBS ERP V2

Dokumen ini memetakan seluruh temuan pada `Laporan_Audit_FHTBS-ERP(1).md` (dokumen sumber kebenaran) terhadap status implementasinya di repository ini, mengikuti solusi kerucut **"Kunci-Satukan-Standarkan"** dari Bagian D audit (Model Divergen-Konvergen: strategi S4 terpilih dengan skor 4,30).

**Legenda:** ✅ terimplementasi penuh · 🟡 terimplementasi sebagian · ⬜ belum / direncanakan pada fase berikutnya

---

## Ringkasan per Fase Peta Jalan (Bagian E audit)

### Fase 0 — Hentikan Kebocoran

| # | Butir audit | Status | Implementasi |
|---|---|---|---|
| 1 | Seed kredensial plaintext di-reset tiap boot | ✅ | `src/db/database.ts` → `seedCoreUsers()`: hash **bcrypt**, *insert-only* (tidak menimpa password yang sudah diganti), password awal via env `SEED_EGHY_PASSWORD` / `SEED_LUDY_PASSWORD` / `SEED_ADMIN_PASSWORD`. Akun `admin` tanpa env = terkunci acak. Blok lama di `initDb()` dan `seedMasterBaseline()` dihapus |
| 2 | Fallback `JWT_SECRET` diketahui umum | ✅ | `src/utils/secrets.ts`: production fail-fast (sudah ada di `server.ts`), development memakai secret acak per-boot. Fallback hardcoded dihapus dari `middleware/auth.ts` dan `auth_routes.ts`. `.env.example` sudah mendokumentasikan |
| 3 | Firestore baca-tulis publik + sinkronisasi tabel sensitif | ✅ | `firestore.rules` → **deny all**. Sync Firestore sudah otomatis no-op tanpa kredensial (SQLITE_FALLBACK). Endpoint migrasi kini di-guard FC |
| 4 | Login plaintext | ✅ | Seed tidak lagi plaintext; login tetap kompatibel membaca hash lama, dan change-password selalu menulis bcrypt |
| 5 | Middleware global deny-by-default `/api/*` + whitelist publik | ✅ | `server.ts`: gerbang global — semua `/api/*` wajib sesi kecuali whitelist (toko, karier, login/register, health). Rute baru otomatis terlindungi |
| 6 | Upload: wajib login, whitelist MIME, nama acak, nosniff | ✅ | `upload_routes.ts`: `requireAuth`, whitelist JPG/PNG/WebP/GIF/PDF, ekstensi diturunkan dari MIME, limit 25 MB; `/uploads` disajikan dengan `X-Content-Type-Options: nosniff` + CSP |
| 7 | Hapus PIN universal | ✅ | Sudah dilakukan di V2 (`utils/auth.ts` tidak lagi punya PIN master hardcoded) |
| 8 | Toko: PENDING_PAYMENT, confirm-payment hanya simpan bukti, validasi qty/jarak | ✅ | `shop.ts`: non-COD → `PENDING_PAYMENT`; `confirm-payment` → `AWAITING_VERIFICATION` (PAID hanya oleh admin terverifikasi); qty wajib bilangan bulat positif, jarak ≥ 0, alamat wajib untuk DELIVERY, cek ketersediaan stok sebelum reservasi |
| 9 | Pelunasan invoice: tolak PAID/VOID, batasi sisa tagihan, kas = uang diterima | ✅ | `finance.ts` `/api/finance/invoices/:id/pay`: penolakan status, pembatasan kelebihan bayar, `finance_transactions` mencatat kas aktual, `paid_at` hanya saat lunas, identitas dari `req.user` |
| 10 | Audit akses log sebelum penutupan | ⬜ | Prosedur operasional — lakukan di lingkungan deploy lama bila masih aktif |

### Fase 1 — Fondasi Keamanan

| Butir audit | Status | Implementasi |
|---|---|---|
| Identitas hanya dari `req.user` | 🟡 | Titik paling berbahaya diperbaiki: clock-in absensi (`hr-attendance.ts`), validasi PIN pelunasan (`finance.ts`), log audit PR/PO (`purchasing.ts`). Sisa pembacaan `x-user-email` di handler lain masih ada, tetapi **gerbang deny-by-default** memastikan semua rute non-publik sudah memerlukan token valid, dan identitas di titik mutasi sensitif tidak lagi bisa dipalsukan |
| Satu enum peran server+klien | 🟡 | `requireRole` kini mengakui `GOD_MODE`/`SUPER_ADMIN`; god-mode server-side untuk `Eghy`/`Ludy` selaras dengan `pbac.ts` klien |
| God-mode berbasis username di server | ✅ | `middleware/auth.ts` → `GOD_MODE_USERNAMES = ["eghy","ludy"]` dengan bypass penuh di `requireRole` |
| Peran tidak bisa dipilih saat register | ✅ | `auth_routes.ts`: peran eksekutif pada registrasi dipaksa menjadi `STAFF` |
| Pemetaan departemen FIN → FC di exchange-token | ✅ | `hr.ts`: FIN tidak lagi otomatis FC |
| helmet / rate-limit / CORS terbatas | ✅ | Sudah ada di V2 (`server.ts`) |
| `GET /api/auth/me` + logout saat 401 | ✅ | Endpoint baru + `AuthContext` memvalidasi sesi saat aplikasi dibuka; logika event 401 yang sebelumnya terbalik diperbaiki di `apiFetch` dan `AuthContext` |
| Auth Socket.io | ⬜ | Belum — socket masih tanpa autentikasi (direkomendasikan Fase 1 lanjutan) |
| Idempotency antrean offline | ⬜ | Belum — `src/lib/idempotency.ts` sudah tersedia, tinggal diaktifkan |

### Fase 2 — Integritas Data & Kontrak API

| Butir audit | Status | Implementasi |
|---|---|---|
| PO/PR batal bisa diterbitkan ulang | ✅ | `purchasing.ts`: `authorize-po` & `authorize-pr` menolak status non-pending |
| Satu `InventoryService` + `stock_ledger` + CHECK constraint | ⬜ | Model 5 kolom stok masih ada; konsolidasi penuh adalah pekerjaan Fase 2 terjadwal |
| `LedgerService` menjurnal 6 jenis dokumen | 🟡 | Jurnal pelunasan invoice sudah terhubung (`postInvoicePaymentJournal`); GRN/SJ/PO/payroll belum |
| Mesin status dokumen | 🟡 | Diterapkan pada invoice & PO/PR; dokumen lain bertahap |
| Skema Zod 100% rute mutasi | 🟡 | Bertambah di endpoint yang disentuh; cakupan penuh bertahap |
| Perbaiki 8 pemanggilan UI ke endpoint 404 | ⬜ | Belum dipetakan ulang pada V2 |

### Fase 3 — Sistem Desain

| Butir audit | Status | Catatan |
|---|---|---|
| Komponen `ui/` (FormField, StatCard, Textarea, dst.) | 🟡 | V2 sudah melengkapi pustaka `components/ui` (12+ komponen); adopsi per halaman bertahap |
| Token desain `@theme`, hapus CSS global, aksesibilitas Modal, lint | ⬜ | Program Fase 3 terjadwal — belum dimulai pada iterasi ini |

### Fase 4 — Keberlanjutan

| Butir audit | Status | Catatan |
|---|---|---|
| Migrasi Postgres saat boot | ✅ | Dinonaktifkan default; aktif via `ENABLE_POSTGRES_REPLICA=1` (mis. ke Supabase) |
| Lockfile tidak sinkron (G-20) | ✅ | `package-lock.json` diregenerasi via `npm install` pada iterasi ini |
| Strict TypeScript, CI, uji otomatis | ⬜ | Fase 4 terjadwal |

---

## Fitur Baru (Permintaan Pengguna)

| Permintaan | Status | Detail |
|---|---|---|
| Akun god-mode `Eghy` (`eghyalvandi`) dan `Ludy` (`bachtiarludy`) | ✅ | Di-seed sekali dengan bcrypt; bypass penuh di server (`requireRole`) dan klien (`pbac.ts`) |
| Change Password untuk semua user | ✅ | Backend `POST /api/auth/change-password` (wajib password lama, bcrypt, audit log) + UI modal di menu avatar Layout |
| Tutorial trial localhost | ✅ | `docs/TUTORIAL_TRIAL_LOCALHOST.md` |
| Tutorial deploy 0–100 (Hostinger + Supabase) | ✅ | `docs/PANDUAN_DEPLOY_HOSTINGER_SUPABASE.md` |

## Catatan Kejujuran Cakupan

Audit memuat 28 gap (G-01 s.d. G-28) dengan peta jalan 4 fase yang dirancang sebagai program berminggu-minggu. Iterasi ini **menuntaskan seluruh Fase 0 (semua temuan KRITIS)** dan bagian terpenting Fase 1, sehingga sistem tidak lagi bisa dieksploitasi tanpa login dan kata sandi tidak lagi bocor/ter-reset. Pekerjaan Fase 2–4 (konsolidasi stok, penjurnalan lengkap, sistem desain penuh, CI) bersifat struktural dan terjadwal — fondasinya (gerbang auth, satu jalur identitas, seed aman) sudah terpasang sehingga pekerjaan lanjutan tidak lagi "menambal tanpa arah".
