"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, CardContent, Input, Label, extractErrorMessage, PASSWORD_REQUIREMENTS_HINT, validatePasswordClientSide } from "@education-erp/ui";
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
    const passwordIssue = validatePasswordClientSide(newPassword);
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/api/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      // The server revokes every older session on a password change and
      // hands this one fresh tokens; keep them or the next refresh logs out.
      const tokens = res.data.data as { access_token?: string; refresh_token?: string } | undefined;
      if (tokens?.access_token && tokens.refresh_token) {
        useAuthStore.setState({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      }
      clearMustChangePassword();
      toast.success("Password changed");
      router.replace("/");
    } catch (err: unknown) {
      const message = extractErrorMessage(err) ?? "Failed to change password";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="text-lg font-semibold">Set a New Password</h2>
            <p className="text-sm text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_HINT}</p>
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
        </CardContent>
      </Card>
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
