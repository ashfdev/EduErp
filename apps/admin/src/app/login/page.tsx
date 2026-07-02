"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Input, Label, Card, CardContent } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

const ROLE_REDIRECT: Record<string, string> = {
  ADMIN: "/dashboard",
  PRINCIPAL: "/dashboard",
  VICE_PRINCIPAL: "/dashboard",
  IT_ADMIN: "/dashboard",
  SUPER_ADMIN: "/dashboard",
  EXAM_CONTROLLER: "/dashboard",
  ACCOUNTANT: "/dashboard",
  LIBRARIAN: "/dashboard",
  CLASS_TEACHER: "/dashboard",
  SUBJECT_TEACHER: "/dashboard",
};

type ForgotState = "hidden" | "phone" | "otp" | "reset" | "done";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, setSession } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  const { data: institution } = useQuery({
    queryKey: ["public", "institution"],
    queryFn: async () => (await api.get("/api/settings/institution")).data.data,
  });

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ type: "invalid" | "disabled" | "network"; message: string } | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/api/auth/login", { identifier, password, portal: "admin" });
      setSession(res.data.data);
      router.replace(ROLE_REDIRECT[res.data.data.user.role] ?? "/dashboard");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: { error?: { message: string } } } };
      if (axiosErr.response?.status === 401) {
        const msg = axiosErr.response.data?.error?.message ?? "Invalid credentials";
        setError({ type: msg.includes("disabled") ? "disabled" : "invalid", message: msg });
      } else {
        setError({ type: "network", message: "Network error — please try again" });
      }
    } finally {
      setLoading(false);
    }
  }

  const [forgotState, setForgotState] = useState<ForgotState>("hidden");
  const [forgotPhone, setForgotPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  async function sendOtp() {
    setForgotLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { phone: forgotPhone });
      toast.success("OTP sent to your phone");
      setForgotState("otp");
      setResendTimer(120);
    } catch {
      toast.error("Could not send OTP — check the phone number");
    } finally {
      setForgotLoading(false);
    }
  }

  async function verifyOtp() {
    setForgotLoading(true);
    try {
      const res = await api.post("/api/auth/verify-otp", { phone: forgotPhone, otp });
      setResetToken(res.data.data.reset_token);
      setForgotState("reset");
    } catch {
      toast.error("Invalid or expired OTP");
    } finally {
      setForgotLoading(false);
    }
  }

  async function submitReset() {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setForgotLoading(true);
    try {
      await api.post("/api/auth/reset-password", { reset_token: resetToken, new_password: newPassword, confirm_password: confirmPassword });
      setForgotState("done");
    } catch {
      toast.error("Could not reset password — the link may have expired");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-2/5 flex-col items-center justify-center bg-primary p-12 text-primary-foreground md:flex">
        {institution?.logo_url ? (
          <img src={institution.logo_url} alt="Logo" className="mb-6 h-20" />
        ) : (
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">🏫</div>
        )}
        <h1 className="text-center text-2xl font-semibold">{institution?.name_en ?? "Education ERP"}</h1>
        <p className="mt-auto text-sm text-primary-foreground/70">Powered by AshDevs</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 pt-6">
            {forgotState === "hidden" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Staff Login</h2>
                  <p className="text-sm text-muted-foreground">Admin Portal</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Phone or Email</Label>
                  <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
                </div>

                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <div className="flex gap-2">
                    <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPassword((s) => !s)}>
                      {showPassword ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>

                <button type="button" className="text-sm text-primary hover:underline" onClick={() => setForgotState("phone")}>
                  Forgot Password?
                </button>

                {error && (
                  <div className={`rounded-md border p-3 text-sm ${error.type === "disabled" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-red-300 bg-red-50 text-red-700"}`}>
                    {error.message}
                    {error.type === "disabled" && <p className="mt-1 text-xs">Contact your administrator to reactivate this account.</p>}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            )}

            {forgotState === "phone" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Reset Password</h2>
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
                <Button className="w-full" onClick={sendOtp} disabled={forgotLoading || !forgotPhone}>
                  Send OTP
                </Button>
                <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setForgotState("hidden")}>
                  Back to login
                </button>
              </div>
            )}

            {forgotState === "otp" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Enter OTP</h2>
                <p className="text-sm text-muted-foreground">A 6-digit code was sent to {forgotPhone}</p>
                <Input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} placeholder="000000" />
                <Button className="w-full" onClick={verifyOtp} disabled={forgotLoading || otp.length !== 6}>
                  Verify
                </Button>
                <Button type="button" variant="outline" className="w-full" disabled={resendTimer > 0} onClick={sendOtp}>
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </Button>
              </div>
            )}

            {forgotState === "reset" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Set New Password</h2>
                <div className="space-y-1.5">
                  <Label>New Password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                <Button className="w-full" onClick={submitReset} disabled={forgotLoading || !newPassword}>
                  Reset Password
                </Button>
              </div>
            )}

            {forgotState === "done" && (
              <div className="space-y-4 text-center">
                <p className="text-lg font-semibold text-emerald-600">Password reset successfully</p>
                <Button className="w-full" onClick={() => setForgotState("hidden")}>
                  Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
