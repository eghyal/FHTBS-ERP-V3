import crypto from "crypto";

/**
 * Sumber tunggal untuk JWT secret (G-02).
 * - Production: JWT_SECRET wajib diisi (server.ts sudah fail-fast).
 * - Development: bila kosong, dibuat secret acak per-boot. Seluruh sesi
 *   gugur setiap restart — tidak ada lagi fallback hardcoded yang bisa
 *   dipakai untuk menempa token.
 */
let ephemeralDevSecret: string | null = null;

export function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 16) return envSecret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[Security] JWT_SECRET environment variable wajib diisi (min. 16 karakter) di production.",
    );
  }

  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(48).toString("base64");
    console.warn(
      "[Security] JWT_SECRET tidak diset. Memakai secret acak per-boot (khusus development). " +
        "Semua sesi akan gugur saat server restart. Isi JWT_SECRET di .env untuk sesi persisten.",
    );
  }
  return ephemeralDevSecret;
}
