"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("login");

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
        const msg = axiosErr.response.data?.error?.message ?? t("invalidCredentials");
        setError({ type: msg.includes("disabled") ? "disabled" : "invalid", message: msg });
      } else {
        setError({ type: "network", message: t("networkError") });
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
      toast.success(t("otpSent"));
      setForgotState("otp");
      setResendTimer(120);
    } catch {
      toast.error(t("otpSendFailed"));
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
      toast.error(t("otpInvalid"));
    } finally {
      setForgotLoading(false);
    }
  }

  async function submitReset() {
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordMismatch"));
      return;
    }
    setForgotLoading(true);
    try {
      await api.post("/api/auth/reset-password", { reset_token: resetToken, new_password: newPassword, confirm_password: confirmPassword });
      setForgotState("done");
    } catch {
      toast.error(t("resetFailed"));
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full bg-white">
      
      {/* Mobile Full Background Illustration */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center lg:hidden"
        style={{
          backgroundImage: "url('/assets/login-illustration.png')",
        }}
      />
      <div className="absolute inset-0 z-0 bg-white/60 lg:hidden backdrop-blur-sm" /> {/* Mobile readability overlay */}

      <div className="relative z-10 flex w-full">
        
        {/* Left Side - Full Background Illustration (Desktop) */}
        <div className="relative hidden w-1/2 flex-col items-center justify-start p-10 lg:flex overflow-hidden">
          
          {/* Background Image with Zoom to hide white borders */}
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('/assets/login-illustration.png')",
              transform: "scale(1.25)",
            }}
          />
          
          {/* Stronger gradient at the top for text readability without drawing a box */}
          <div className="absolute top-0 left-0 right-0 z-0 bg-gradient-to-b from-white via-white/70 to-transparent h-[350px] pointer-events-none"></div>
          
          {/* Branding at the top */}
          <div className="relative z-10 flex flex-col items-center text-center mt-6">
            {institution?.logo_url ? (
              <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full bg-white p-4 shadow-xl ring-4 ring-white/60">
                <img src={institution.logo_url} alt="Logo" className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full bg-white text-5xl shadow-xl ring-4 ring-white/60">🏫</div>
            )}
            <h1 className="text-3xl font-black text-slate-900 tracking-tight px-2 [text-shadow:_0_0_20px_rgba(255,255,255,1),_0_0_30px_rgba(255,255,255,1),_0_0_40px_rgba(255,255,255,1)]">
              {institution?.name_en ?? "Education ERP"}
            </h1>
          </div>
          
          <p className="absolute bottom-6 w-full text-center text-xs font-bold text-slate-500 drop-shadow-sm z-10">{t("poweredBy")}</p>
        </div>

        {/* Right Side - Form Container */}
        <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-transparent lg:bg-[#eef3fb] p-6 sm:p-12">
          
          {/* Mobile Branding - Only visible on small screens */}
          <div className="w-full text-center mb-8 lg:hidden relative z-10">
            {institution?.logo_url ? (
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white p-3 shadow-xl ring-4 ring-white/60">
                <img src={institution.logo_url} alt="Logo" className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white text-4xl shadow-xl ring-4 ring-white/60">🏫</div>
            )}
            <h1 className="text-2xl font-black text-slate-900 tracking-tight px-2 [text-shadow:_0_0_15px_rgba(255,255,255,1),_0_0_25px_rgba(255,255,255,1)]">
              {institution?.name_en ?? "Education ERP"}
            </h1>
          </div>

          <div className="mx-auto w-full max-w-md text-center mb-8">
            <h2 className="text-3xl font-medium tracking-tight text-[#2d3748]">
              {forgotState === "hidden" ? t("staffLogin") : forgotState === "phone" ? t("resetPassword") : forgotState === "otp" ? t("enterOtp") : forgotState === "reset" ? t("setNewPassword") : ""}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {forgotState === "hidden" ? "Hey enter your details to sign in to your account" : forgotState === "phone" ? "Enter your phone number to reset" : forgotState === "otp" ? t("otpSentTo", { phone: forgotPhone }) : ""}
            </p>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
            {forgotState === "hidden" && (
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">{t("phoneOrEmail")}</Label>
                  <Input className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm transition-all focus:bg-white" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus placeholder="e.g. admin@school.com" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700">{t("password")}</Label>
                    <button type="button" className="text-xs font-medium text-blue-500 hover:text-blue-600" onClick={() => setForgotState("phone")}>
                      {t("forgotPassword")}
                    </button>
                  </div>
                  <div className="relative">
                    <Input className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm transition-all focus:bg-white pr-16" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600" onClick={() => setShowPassword((s) => !s)}>
                      {showPassword ? t("hide") : t("show")}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className={`rounded-lg border p-4 text-sm ${error.type === "disabled" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                    <span className="font-semibold">{error.message}</span>
                    {error.type === "disabled" && <p className="mt-1 text-xs">{t("contactAdmin")}</p>}
                  </div>
                )}

                <Button type="submit" className="w-full rounded-lg py-6 text-base font-bold bg-[#0066ff] hover:bg-blue-700 transition-all text-white" disabled={loading}>
                  {loading ? t("signingIn") : "Login"}
                </Button>

                <div className="mt-4 text-center text-sm text-slate-500">
                  <span className="mr-1">Don't have account?</span>
                  <button type="button" className="text-blue-500 hover:underline">Create new account</button>
                </div>
              </form>
            )}

            {forgotState === "phone" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">{t("phoneNumber")}</Label>
                  <Input className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm" value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
                <Button className="w-full rounded-lg py-6 text-base font-bold bg-[#0066ff] hover:bg-blue-700 text-white" onClick={sendOtp} disabled={forgotLoading || !forgotPhone}>
                  {t("sendOtp")}
                </Button>
                <button type="button" className="w-full text-center text-sm font-bold text-slate-500 hover:text-slate-800" onClick={() => setForgotState("hidden")}>
                  {t("backToLogin")}
                </button>
              </div>
            )}

            {forgotState === "otp" && (
              <div className="space-y-6">
                <Input className="text-center tracking-widest text-xl rounded-lg bg-[#f8fafc] py-6" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} placeholder="000000" />
                <Button className="w-full rounded-lg py-6 text-base font-bold bg-[#0066ff] hover:bg-blue-700 text-white" onClick={verifyOtp} disabled={forgotLoading || otp.length !== 6}>
                  {t("verify")}
                </Button>
                <Button type="button" variant="outline" className="w-full rounded-lg py-6 text-base font-bold" disabled={resendTimer > 0} onClick={sendOtp}>
                  {resendTimer > 0 ? t("resendIn", { seconds: resendTimer }) : t("resendOtp")}
                </Button>
              </div>
            )}

            {forgotState === "reset" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">{t("newPassword")}</Label>
                  <Input type="password" className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">{t("confirmPassword")}</Label>
                  <Input type="password" className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                <Button className="w-full rounded-lg py-6 text-base font-bold bg-[#0066ff] hover:bg-blue-700 text-white" onClick={submitReset} disabled={forgotLoading || !newPassword}>
                  {t("resetPasswordButton")}
                </Button>
              </div>
            )}

            {forgotState === "done" && (
              <div className="space-y-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-lg font-bold text-slate-800">{t("resetSuccess")}</p>
                <Button className="w-full rounded-lg py-6 text-base font-bold bg-[#0066ff] hover:bg-blue-700 text-white" onClick={() => setForgotState("hidden")}>
                  {t("backToLoginButton")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
