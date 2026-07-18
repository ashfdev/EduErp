"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Input, Label } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { ProtectedRoute } from "@/components/protected-route";

function ChangePasswordForm() {
  const router = useRouter();
  const { clearMustChangePassword, user } = useAuthStore();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      clearMustChangePassword();
      toast.success("Password changed");
      router.replace("/");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to change password";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Set a New Password</h2>
        <p className="text-sm text-gray-500">
          {user?.name_en ? `Welcome, ${user.name_en}. ` : ""}
          For security, you must set your own password before continuing.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Current (temporary) password</Label>
          <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm new password</Label>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Saving..." : "Set Password & Continue"}
        </Button>
      </form>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <ProtectedRoute>
      <ChangePasswordForm />
    </ProtectedRoute>
  );
}
