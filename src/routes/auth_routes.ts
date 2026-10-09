import jwt from "jsonwebtoken";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, requireAuth, type AuthenticatedRequest } from "../middleware/auth.ts";
import { getJwtSecret } from "../utils/secrets.ts";
import { logAudit } from "../utils/audit.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.post("/api/auth/login", async (req, res) => {
      try {
        const { username, password } = req.body;
        const user = db
          .prepare(
            "SELECT id, username, password as hashed_password, role, level, name, status FROM users WHERE username = ?",
          )
          .get(username) as any;

        if (!user) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        // Backward compatibility for existing plaintext passwords
        let isMatch = false;
        if (
          user.hashed_password &&
          (user.hashed_password.startsWith("$2b$") ||
            user.hashed_password.startsWith("$2a$"))
        ) {
          isMatch = await bcrypt.compare(password, user.hashed_password);
        } else {
          isMatch = password === user.hashed_password;
        }

        if (!isMatch) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        if (user.status === "REJECTED") {
          return res.status(403).json({
            error:
              "Your account request was rejected by Full Control. Please contact your administrator.",
          });
        }
        if (user.status !== "APPROVED") {
          return res.status(403).json({
            error: "Your account is pending approval by Full Control.",
          });
        }

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            role: user.role,
            level: user.level,
            name: user.name,
          },
          getJwtSecret(),
          { expiresIn: "24h" },
        );

        res.cookie("auth_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });

        // Do not return password hash
        delete user.hashed_password;
        res.json({ success: true, user, token });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
      }
    });

    router.post("/api/auth/register", async (req, res) => {
      try {
        const { username, password, role, level, name } = req.body;
        if (!username || !password || !role)
          return res.status(400).json({ error: "Missing required fields" });

        // Check for EXISTING username regardless of status
        const existingUser = db
          .prepare("SELECT id, status FROM users WHERE username = ?")
          .get(username) as any;
        if (existingUser) {
          if (existingUser.status === "REJECTED") {
            // If rejected, remove the rejected record to allow re-registration
            db.prepare("DELETE FROM users WHERE id = ?").run(existingUser.id);
          } else {
            return res.status(400).json({ error: "Username already exists" });
          }
        }

        const id = "USER-" + Math.random().toString(36).substr(2, 9);
        const hashedPassword = await bcrypt.hash(password, 12);

        // G-09 (diperbaiki): pendaftar TIDAK boleh memilih peran eksekutif.
        // Peran istimewa hanya dapat diberikan FC lewat persetujuan manual.
        const EXECUTIVE_ROLES = ["FC", "ADMIN", "SUPERADMIN", "SUPER_ADMIN", "BOD", "DIRECTOR", "GOD_MODE"];
        const requestedRole = String(role || "").toUpperCase();
        const safeRole = EXECUTIVE_ROLES.includes(requestedRole)
          ? "STAFF"
          : requestedRole || "STAFF";

        db.prepare(
          `
        INSERT INTO users (id, username, password, role, level, name, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `,
        ).run(
          id,
          username,
          hashedPassword,
          safeRole,
          level || "STAFF",
          name || username,
        );

        // Auto-assign to Forum
        db.prepare(
          "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES ('THREAD-GENERAL', ?)",
        ).run(username);

        res.json({
          success: true,
          message: "Account request submitted. Please wait for FC approval.",
        });
      } catch (error: any) {
        if (error.message.includes("UNIQUE constraint failed")) {
          return res.status(400).json({ error: "Username already exists" });
        }
        console.error(error);
        res.status(500).json({ error: "Registration failed" });
      }
    });

    router.get("/api/auth/pending", requireRole(["FC"]), (req, res) => {
      try {
        const users = db
          .prepare(
            "SELECT id, username, role, level, name, status, created_at FROM users WHERE status = 'PENDING' ORDER BY created_at DESC",
          )
          .all();
        res.json(users);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch pending accounts" });
      }
    });

    router.post("/api/auth/approve", requireRole(["FC"]), (req, res) => {
      try {
        const { id } = req.body;
        const targetUser = db
          .prepare("SELECT username, name FROM users WHERE id = ?")
          .get(id) as any;

        db.prepare(
          "UPDATE users SET status = 'APPROVED', is_approved = 1 WHERE id = ?",
        ).run(id);

        if (targetUser) {
          logAudit(
            (req.headers["x-user-email"] || "FC") as string,
            "APPROVE_ACCOUNT",
            "USER",
            id,
            `Approved account for ${targetUser.username}`,
          );

          // Broadcast welcome message to Forum
          const msgId = "MSG-" + Math.random().toString(36).substr(2, 9);
          db.prepare(
            `
          INSERT INTO chat_messages (id, thread_id, sender_username, content) 
          VALUES (?, ?, ?, ?)
        `,
          ).run(
            msgId,
            "THREAD-GENERAL",
            "SYSTEM",
            `🎊 **New Member Alert!** 🎊Welcome to the family, **${targetUser.name || targetUser.username}**! 🤝We're excited to have you onboard. Feel free to introduce yourself here! ✨---`,
          );
        }

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to approve account" });
      }
    });

    router.post("/api/auth/reject", requireRole(["FC"]), (req, res) => {
      try {
        const { id } = req.body;
        const targetUser = db
          .prepare("SELECT username, name FROM users WHERE id = ?")
          .get(id) as any;

        db.prepare("UPDATE users SET status = 'REJECTED' WHERE id = ?").run(id);

        if (targetUser) {
          logAudit(
            (req.headers["x-user-email"] || "FC") as string,
            "REJECT_ACCOUNT",
            "USER",
            id,
            `Rejected account for ${targetUser.username}`,
          );
        }

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to reject account" });
      }
    });

    /**
     * GET /api/auth/me — validasi sesi saat aplikasi dibuka (G-16).
     * Mengembalikan profil pengguna dari token yang masih berlaku.
     */
    router.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
      res.json({ success: true, user: req.user });
    });

    /**
     * POST /api/auth/change-password — semua pengguna dapat mengganti
     * kata sandi sendiri. Wajib konfirmasi kata sandi lama.
     * Body: { current_password, new_password }
     */
    router.post(
      "/api/auth/change-password",
      requireAuth,
      async (req: AuthenticatedRequest, res) => {
        try {
          const { current_password, new_password } = req.body || {};

          if (!current_password || !new_password) {
            return res
              .status(400)
              .json({ error: "Kata sandi lama dan baru wajib diisi." });
          }
          if (typeof new_password !== "string" || new_password.length < 8) {
            return res
              .status(400)
              .json({ error: "Kata sandi baru minimal 8 karakter." });
          }
          if (new_password === current_password) {
            return res.status(400).json({
              error: "Kata sandi baru tidak boleh sama dengan kata sandi lama.",
            });
          }

          const user = db
            .prepare("SELECT id, username, password FROM users WHERE id = ?")
            .get(req.userId) as any;
          if (!user) {
            return res.status(404).json({ error: "Pengguna tidak ditemukan." });
          }

          // Verifikasi kata sandi lama (dukung hash bcrypt maupun legasi plaintext)
          let isMatch = false;
          if (
            user.password &&
            (user.password.startsWith("$2b$") || user.password.startsWith("$2a$"))
          ) {
            isMatch = await bcrypt.compare(current_password, user.password);
          } else {
            isMatch = current_password === user.password;
          }
          if (!isMatch) {
            return res
              .status(401)
              .json({ error: "Kata sandi lama yang Anda masukkan salah." });
          }

          const hashed = await bcrypt.hash(new_password, 12);
          db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
            hashed,
            user.id,
          );

          logAudit(
            req.username || user.username,
            "CHANGE_PASSWORD",
            "USER",
            user.id,
            `Password changed for ${user.username}`,
          );

          res.json({
            success: true,
            message: "Kata sandi berhasil diperbarui.",
          });
        } catch (error) {
          console.error("[Auth] Change password failed:", error);
          res.status(500).json({ error: "Gagal memperbarui kata sandi." });
        }
      },
    );

