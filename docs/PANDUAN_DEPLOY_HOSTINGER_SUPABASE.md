# Panduan Deploy FHTBS ERP 0–100: Hostinger + Supabase

Panduan ini membawa Anda dari nol sampai FHTBS ERP **live di internet** dengan arsitektur:

| Komponen | Platform | Fungsi |
|---|---|---|
| Aplikasi (Express + React build + SQLite) | **Hostinger VPS** | Menjalankan server ERP 24/7 |
| Database replika PostgreSQL | **Supabase** | Replika data terkelola & cadangan analitik |
| Domain + HTTPS | Hostinger VPS (Nginx + Let's Encrypt) | Akses publik yang aman |

> **Catatan penting arsitektur:** sumber kebenaran data aplikasi adalah **SQLite** di VPS. Supabase dipakai sebagai replika PostgreSQL (opsional namun direkomendasikan untuk cadangan dan pelaporan). Firebase/Firestore **tidak diperlukan** — biarkan kosong.

---

## Bagian A — Persiapan (0–10)

1. **Akun Hostinger** — buka [hostinger.com](https://www.hostinger.com), beli paket **VPS** (minimal KVM 1 / 1 vCPU, 4 GB RAM). Paket *shared hosting* biasa **tidak bisa** menjalankan aplikasi Node.js jangka panjang.
2. Saat setup VPS, pilih OS **Ubuntu 24.04 LTS**. Catat **IP publik** VPS dan password root.
3. **Akun Supabase** — buka [supabase.com](https://supabase.com), sign up gratis.
4. **(Opsional) Domain** — beli di Hostinger atau arahkan domain yang sudah ada ke IP VPS (DNS `A record`).

## Bagian B — Setup Database Supabase (10–25)

1. Di dashboard Supabase → **New Project**:
   - Name: `fhtbs-erp`
   - Database Password: buat yang kuat, **simpan baik-baik**
   - Region: **Singapore** (terdekat dengan Indonesia)
2. Tunggu ±2 menit sampai project siap.
3. Ambil connection string:
   - Masuk **Project Settings → Database → Connection String → URI**
   - Format: `postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
   - Ganti `[PASSWORD]` dengan password database Anda.
4. Simpan string ini — akan dipakai sebagai `DATABASE_URL` di VPS.

## Bagian C — Setup Server Hostinger (25–60)

Login ke VPS via SSH (dari terminal lokal):

```bash
ssh root@IP_VPS_ANDA
```

### C.1 Update sistem & instal Node.js

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git nginx certbot python3-certbot-nginx ufw build-essential
node -v   # harus v22.x
npm install -g pm2
```

### C.2 Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### C.3 Ambil kode aplikasi

```bash
cd /var/www
git clone https://github.com/eghyal/FHTBS-ERP-V2.git fhtbs-erp
cd fhtbs-erp
# atau upload bundle ZIP lalu: unzip FHTBS-ERP.zip -d fhtbs-erp
```

### C.4 Konfigurasi environment production

```bash
cp .env.example .env
nano .env
```

Isi:

```ini
NODE_ENV=production
PORT=3000

# WAJIB — generate dengan: openssl rand -base64 48
JWT_SECRET=<hasil-openssl-rand>

# Domain Anda (setelah DNS aktif). Pisahkan dengan koma bila lebih dari satu.
ALLOWED_ORIGINS=https://erp.domainanda.com

# Password awal akun god-mode (hanya dipakai saat database pertama dibuat)
SEED_EGHY_PASSWORD=eghyalvandi
SEED_LUDY_PASSWORD=bachtiarludy

# Replika Supabase (Bagian B)
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
ENABLE_POSTGRES_REPLICA=1
```

> Simpan (`Ctrl+O`, Enter, `Ctrl+X`).

### C.5 Install & build

```bash
npm install
npm run build
```

### C.6 Jalankan dengan PM2 (auto-restart)

```bash
pm2 start npm --name fhtbs-erp -- start
pm2 save
pm2 startup systemd   # ikuti perintah yang muncul di layar
```

Cek status: `pm2 status` dan `pm2 logs fhtbs-erp`.
Bila log menampilkan `Server running on http://localhost:3000`, aplikasi sudah jalan.

## Bagian D — Domain & HTTPS (60–85)

### D.1 Arahkan DNS

Di panel DNS domain Anda (Hostinger → Domains → DNS Zone):

| Type | Name | Value |
|---|---|---|
| A | `erp` (atau `@`) | IP VPS Anda |

Tunggu propagasi (5 menit–24 jam).

### D.2 Konfigurasi Nginx reverse proxy

```bash
nano /etc/nginx/sites-available/fhtbs-erp
```

Isi:

```nginx
server {
    server_name erp.domainanda.com;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan:

```bash
ln -s /etc/nginx/sites-available/fhtbs-erp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### D.3 HTTPS gratis (Let's Encrypt)

```bash
certbot --nginx -d erp.domainanda.com
```

Pilih redirect HTTP → HTTPS. Selesai — situs kini aman di `https://erp.domainanda.com`.

## Bagian E — Verifikasi & Go-Live (85–100)

1. Buka `https://erp.domainanda.com/api/health` → harus membalas `{"status":"ok"}`.
2. Buka `https://erp.domainanda.com` → halaman login tampil.
3. Login sebagai **Eghy** / **Ludy** (password sesuai `SEED_*` di `.env`).
4. **Segera ganti password** lewat menu avatar → **Change Password**.
5. Buat akun untuk tim lewat halaman Register, lalu approve sebagai god-mode.
6. Cek replika Supabase: dashboard Supabase → **Table Editor** — tabel-tabel ERP mulai terisi setelah boot pertama dengan `ENABLE_POSTGRES_REPLICA=1`.

## Operasional Harian

| Kebutuhan | Perintah |
|---|---|
| Lihat log | `pm2 logs fhtbs-erp` |
| Restart aplikasi | `pm2 restart fhtbs-erp` |
| Update kode | `cd /var/www/fhtbs-erp && git pull && npm install && npm run build && pm2 restart fhtbs-erp` |
| Backup database | `cp /var/www/fhtbs-erp/data/erp.db /backup/erp-$(date +%F).db` (jadwalkan via cron) |
| Backup file upload | `tar -czf /backup/uploads-$(date +%F).tar.gz /var/www/fhtbs-erp/uploads` |

## Keamanan Pasca-Deploy (Wajib)

- [ ] `JWT_SECRET` unik, panjang, dan tidak di-commit ke mana pun
- [ ] Password `Eghy` dan `Ludy` sudah diganti dari password awal
- [ ] `ALLOWED_ORIGINS` hanya berisi domain Anda
- [ ] Firewall `ufw` aktif; port 3000 **tidak** dibuka publik (hanya 80/443 via Nginx)
- [ ] `ENABLE_POSTGRES_REPLICA=1` hanya bila Supabase sudah siap

## Troubleshooting

| Gejala | Solusi |
|---|---|
| `pm2 logs` menampilkan `FATAL: JWT_SECRET` | Isi `JWT_SECRET` di `.env`, lalu `pm2 restart fhtbs-erp` |
| 502 Bad Gateway di Nginx | Aplikasi mati — cek `pm2 status`; pastikan `PORT=3000` konsisten |
| Replika Supabase kosong | Cek `DATABASE_URL` dan `ENABLE_POSTGRES_REPLICA=1`; lihat log `pm2 logs` |
| Upload gagal | Pastikan folder `uploads/` ada dan bisa ditulis: `mkdir -p uploads && chmod 755 uploads` |
| Certbot gagal | DNS belum mengarah ke IP VPS — tunggu propagasi |
