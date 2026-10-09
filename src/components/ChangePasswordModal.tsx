import React, { useState } from "react";
import { KeyRound, Eye, EyeOff, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal "Change Password" — tersedia untuk SEMUA pengguna yang login.
 * Memanggil POST /api/auth/change-password (wajib kata sandi lama).
 */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFormError(null);
    setShowCurrent(false);
    setShowNew(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentPassword || !newPassword) {
      setFormError("Semua kolom wajib diisi.");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/auth/change-password",
        {
          method: "POST",
          body: {
            current_password: currentPassword,
            new_password: newPassword,
          },
        },
        user?.username || "",
      );

      if (!res.ok) {
        setFormError(res.error || "Gagal memperbarui kata sandi.");
        return;
      }

      showToast("Kata sandi berhasil diperbarui.", "success");
      handleClose();
    } catch (err) {
      console.error("Change password error:", err);
      setFormError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCurrent = (
    <button
      type="button"
      onClick={() => setShowCurrent((v) => !v)}
      className="text-stone-400 hover:text-stone-600 transition-colors"
      aria-label={showCurrent ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
    >
      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
  const toggleNew = (
    <button
      type="button"
      onClick={() => setShowNew((v) => !v)}
      className="text-stone-400 hover:text-stone-600 transition-colors"
      aria-label={showNew ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
    >
      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-stone-500" />
          Change Password
        </span>
      }
      description="Perbarui kata sandi akun Anda. Kata sandi baru berlaku segera setelah disimpan."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Kata Sandi Saat Ini"
          type={showCurrent ? "text" : "password"}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          endIcon={toggleCurrent}
          required
        />
        <Input
          label="Kata Sandi Baru"
          type={showNew ? "text" : "password"}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          endIcon={toggleNew}
          helperText="Minimal 8 karakter."
          required
        />
        <Input
          label="Konfirmasi Kata Sandi Baru"
          type={showNew ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        {formError && (
          <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan…
              </span>
            ) : (
              "Simpan Kata Sandi"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
