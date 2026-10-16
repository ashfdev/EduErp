"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button, Input, Label, LoginLayout, LoginPasswordInput, loginStyles, extractErrorMessage, PASSWORD_REQUIREMENTS_HINT, validatePasswordClientSide, cn, type LoginInstitution } from "@education-erp/ui";
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

  const { data: institution } = useQuery<LoginInstitution>({
    queryKey: ["public", "institution"],
    queryFn: async () => (await api.get("/api/settings/institution")).data.data,
  });

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
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
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err) ?? t("otpSendFailed"));
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
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err) ?? t("otpInvalid"));
    } finally {
      setForgotLoading(false);
    }
  }

  async function submitReset() {
    const passwordIssue = validatePasswordClientSide(newPassword);
    if (passwordIssue) {
      toast.error(passwordIssue);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordMismatch"));
      return;
    }
    setForgotLoading(true);
    try {
      await api.post("/api/auth/reset-password", { reset_token: resetToken, new_password: newPassword, confirm_password: confirmPassword });
      setForgotState("done");
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err) ?? t("resetFailed"));
    } finally {
      setForgotLoading(false);
    }
  }

  const heading =
    forgotState === "hidden" ? t("staffLogin") : forgotState === "phone" ? t("resetPassword") : forgotState === "otp" ? t("enterOtp") : forgotState === "reset" ? t("setNewPassword") : null;
  const subheading =
    forgotState === "hidden" ? t("subtitle") : forgotState === "phone" ? t("resetSubtitle") : forgotState === "otp" ? t("otpSentTo", { phone: forgotPhone }) : forgotState === "reset" ? PASSWORD_REQUIREMENTS_HINT : null;

  return (
    <LoginLayout institution={institution} portalLabel={t("panelLabel")} footer={t("poweredBy")}>
      <div className="flex flex-col gap-[18px] lg:gap-6">
        {heading && (
          <div className="flex flex-col gap-1.5 lg:gap-2">
            <h1 className={loginStyles.title}>{heading}</h1>
            {subheading && <p className={loginStyles.subtitle}>{subheading}</p>}
          </div>
        )}

        {forgotState === "hidden" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-[18px] lg:gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-id" className={loginStyles.label}>{t("phoneOrEmail")}</Label>
              <Input id="login-id" className={loginStyles.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus placeholder={t("idPlaceholder")} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="login-password" className={loginStyles.label}>{t("password")}</Label>
                <button type="button" className={cn(loginStyles.link, "py-1.5")} onClick={() => setForgotState("phone")}>
                  {t("forgotPassword")}
                </button>
              </div>
              <LoginPasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" showLabel={t("show")} hideLabel={t("hide")} />
            </div>

            {error && (
              <div role="alert" className={`rounded-lg border px-4 py-3 text-sm ${error.type === "disabled" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                <p className="font-semibold">{error.message}</p>
                {error.type === "disabled" && <p className="mt-1 text-xs">{t("contactAdmin")}</p>}
              </div>
            )}

            <Button type="submit" className={loginStyles.button} disabled={loading}>
              {loading ? t("signingIn") : t("signIn")}
            </Button>
            <p className={loginStyles.help}>{t("help")}</p>
          </form>
        )}

        {forgotState === "phone" && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="forgot-phone" className={loginStyles.label}>{t("phoneNumber")}</Label>
              <Input id="forgot-phone" className={loginStyles.input} inputMode="tel" autoComplete="tel" value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </div>
            <Button className={loginStyles.button} onClick={sendOtp} disabled={forgotLoading || !forgotPhone}>
              {t("sendOtp")}
            </Button>
            <button type="button" className={cn(loginStyles.link, "self-center py-2")} onClick={() => setForgotState("hidden")}>
              {t("backToLogin")}
            </button>
          </>
        )}

        {forgotState === "otp" && (
          <>
            <Input aria-label={t("enterOtp")} className={cn(loginStyles.input, "text-center text-xl tracking-[0.4em]")} inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} placeholder="000000" />
            <Button className={loginStyles.button} onClick={verifyOtp} disabled={forgotLoading || otp.length !== 6}>
              {t("verify")}
            </Button>
            <Button type="button" variant="outline" className={loginStyles.secondaryButton} disabled={resendTimer > 0} onClick={sendOtp}>
              {resendTimer > 0 ? t("resendIn", { seconds: resendTimer }) : t("resendOtp")}
            </Button>
          </>
        )}

        {forgotState === "reset" && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password" className={loginStyles.label}>{t("newPassword")}</Label>
              <LoginPasswordInput id="new-password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} showLabel={t("show")} hideLabel={t("hide")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password" className={loginStyles.label}>{t("confirmPassword")}</Label>
              <LoginPasswordInput id="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} showLabel={t("show")} hideLabel={t("hide")} />
            </div>
            <Button className={loginStyles.button} onClick={submitReset} disabled={forgotLoading || !newPassword}>
              {t("resetPasswordButton")}
            </Button>
          </>
        )}

        {forgotState === "done" && (
          <div className="flex flex-col items-center gap-[18px] text-center lg:gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lime text-forest">
              <Check className="h-8 w-8" />
            </div>
            <p className="text-lg font-bold text-forest">{t("resetSuccess")}</p>
            <Button className={loginStyles.button} onClick={() => setForgotState("hidden")}>
              {t("backToLoginButton")}
            </Button>
          </div>
        )}
      </div>
    </LoginLayout>
  );
}
