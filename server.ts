import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initDb } from './src/db/database.ts';
import { initPostgresDb } from './src/db/postgresClient.ts';
import { runFullPostgresMigration } from './src/db/postgresMigrationEngine.ts';

// Fail-fast security guard: JWT secret wajib eksplisit di production.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[Server] FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('[Server] WARNING: JWT_SECRET is not set; a random per-boot secret will be generated (development only). Set JWT_SECRET in .env for persistent sessions.');
}

// Guarantee SQLite database schema initialization before mounting routes
try {
  initDb();
  console.log('[Server] SQLite database initialized successfully.');
} catch (err) {
  console.error('[Server] Failed to initialize SQLite database:', err);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS allowlist: default same-origin (no cross-origin). Tambahkan origin
// tepercaya via env ALLOWED_ORIGINS="https://a.com,https://b.com".
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Request tanpa Origin header (same-origin, curl, server-to-server) diizinkan.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} tidak diizinkan oleh kebijakan CORS.`));
  },
  credentials: true,
};

app.use(helmet({
  contentSecurityPolicy: false, // SPA + PWA asset compatibility; CSP granular dapat diaktifkan bertahap.
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  setHeaders: (res) => {
    // Cegah sniffing MIME pada berkas unggahan (G-05)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'");
  },
}));

// Rate limiting global untuk API: melindungi dari brute-force & abuse.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate exceeded. Too many requests, please slow down.' },
});
// Rate limiting ketat untuk endpoint autentikasi.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate exceeded. Too many authentication attempts, please try again later.' },
});
app.use('/api/', apiLimiter);
app.use(['/api/auth', '/api/hr-auth'], authLimiter);

// Health & Time endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/time", (req, res) => {
  res.json({ timestamp: Date.now(), time: new Date().toISOString() });
});

// Routes
import { populateUserSession } from './src/middleware/auth.ts';
import { router as adminRouter } from './src/routes/admin_routes.ts';
import { router as authRouter } from './src/routes/auth_routes.ts';
import { chatRouter } from './src/routes/chat.ts';
import { router as dashboardRouter } from './src/routes/dashboard.ts';
import { router as datacenterRouter } from './src/routes/datacenter.ts';
import { router as financeRouter } from './src/routes/finance.ts';
import { forumRouter } from './src/routes/forum.ts';
import { hrAttendanceRouter } from './src/routes/hr-attendance.ts';
import { hrRouter } from './src/routes/hr.ts';
import { router as hrPayrollRouter } from './src/routes/hr_payroll.ts';
import { inventoryRouter } from './src/routes/inventory.ts';
import { router as migrationRouter } from './src/routes/migration_routes.ts';
import { router as productionRouter } from './src/routes/production.ts';
import { router as projectsRouter } from './src/routes/projects.ts';
import { purchasingRouter } from './src/routes/purchasing.ts';
import { salesRouter } from './src/routes/sales.ts';
import { shopRouter } from './src/routes/shop.ts';
import { initShopCatalogAndSeed } from './src/db/shopSeed.ts';
import { router as systemRouter } from './src/routes/system_routes.ts';
import { usersRouter } from './src/routes/users.ts';
import { router as workflowRouter } from './src/routes/workflow.ts';
import { uploadRouter } from './src/routes/upload_routes.ts';
import { router as annualEventRouter } from './src/routes/annual_event_routes.ts';

app.use(populateUserSession);

// ===================================================================
// GERBANG OTORISASI GLOBAL — DENY BY DEFAULT (G-04)
// ===================================================================
// Semua endpoint /api/* WAJIB terautentikasi, kecuali daftar putih
// publik di bawah (toko daring, karier, login/register, health check).
// Rute baru otomatis terlindungi — penambahan rute tidak lagi bisa
// "lupa" dipasangi guard.
const PUBLIC_API_EXACT: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/time' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/consent' },
  { method: 'POST', path: '/api/auth/erasure-request' },
  { method: 'POST', path: '/api/shop/checkout' },
  { method: 'POST', path: '/api/shop/customer-auth' },
  { method: 'POST', path: '/api/shop/customer-cart-sync' },
  { method: 'POST', path: '/api/track/activity' },
  { method: 'GET', path: '/api/hr/jobs-public' },
  { method: 'POST', path: '/api/hr/applications' }, // lamaran kerja publik
  { method: 'GET', path: '/api/upload/presets' },
];
const PUBLIC_API_PREFIXES: Array<{ method: string; prefix: string }> = [
  { method: 'GET', prefix: '/api/shop/products' },       // katalog toko publik
  { method: 'GET', prefix: '/api/shop/orders/' },        // lacak pesanan via nomor order
  { method: 'POST', prefix: '/api/shop/orders/' },       // konfirmasi pembayaran (menyimpan bukti, bukan PAID)
  { method: 'GET', prefix: '/api/public/' },             // konten CMS publik
  { method: 'POST', prefix: '/api/public/leads' },       // formulir leads publik
];

app.use('/api', (req, res, next) => {
  const method = req.method.toUpperCase();
  // req.path di dalam router '/api' relatif terhadap '/api'
  const fullPath = '/api' + (req.path === '/' ? '' : req.path);

  const isPublic =
    PUBLIC_API_EXACT.some((r) => r.method === method && r.path === fullPath) ||
    PUBLIC_API_PREFIXES.some((r) => r.method === method && fullPath.startsWith(r.prefix));

  if (isPublic) return next();
  if ((req as any).userId) return next();

  return res.status(401).json({
    error: 'Authentication required. Silakan login untuk mengakses resource ini.',
  });
});
// ===================================================================

app.use(uploadRouter);
app.use(annualEventRouter);
app.use(adminRouter);
app.use(authRouter);
app.use(chatRouter);
app.use(dashboardRouter);
app.use(datacenterRouter);
app.use(financeRouter);
app.use(forumRouter);
app.use(hrAttendanceRouter);
app.use(hrRouter);
app.use(hrPayrollRouter);
app.use(inventoryRouter);
app.use(migrationRouter);
app.use(productionRouter);
app.use(projectsRouter);
app.use(purchasingRouter);
app.use(salesRouter);
app.use(shopRouter);
app.use(systemRouter);
app.use(usersRouter);
app.use(workflowRouter);

async function startServer() {
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin tidak diizinkan oleh kebijakan CORS.'));
      },
      credentials: true,
    }
  });

  (global as any).io = io;

  io.on('connection', (socket) => {
    console.log('[Socket.io] Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('[Socket.io] Client disconnected:', socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : path.join(process.cwd(), 'build');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize and seed B2C shop catalog and demo data
  initShopCatalogAndSeed();

  // Replika PostgreSQL (opsional, G-15): dinonaktifkan secara default.
  // Aktifkan hanya bila benar-benar dipakai dengan ENABLE_POSTGRES_REPLICA=1
  // dan DATABASE_URL terisi. Migrasi penuh setiap boot membebani startup
  // dan menggandakan data tanpa kebutuhan nyata.
  if (process.env.ENABLE_POSTGRES_REPLICA === '1') {
    initPostgresDb()
      .then(() => runFullPostgresMigration())
      .then((summary) => {
        console.log(
          `[Server] PostgreSQL initialization & data migration complete (${summary.totalMigratedRows} rows across ${summary.totalTables} tables).`,
        );
      })
      .catch((err) => {
        console.error('[Server] PostgreSQL background migration error:', err);
      });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
