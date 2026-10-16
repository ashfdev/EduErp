"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button, Input, Label, LoginLayout, LoginPasswordInput, loginStyles, type LoginInstitution } from "@education-erp/ui";

export default function PortalLoginPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const t = useTranslations("login");

  const { data: institution } = useQuery<LoginInstitution>({
    queryKey: ["public", "institution"],
    queryFn: async () => (await api.get("/api/settings/institution")).data.data,
  });

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/api/auth/login", { identifier, password, portal: "portal" });
      setSession(res.data.data);
      router.replace("/");
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginLayout institution={institution} portalLabel={t("title")} footer={t("poweredBy")}>
      <form onSubmit={submit} className="flex flex-col gap-[18px] lg:gap-6">
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <h1 className={loginStyles.title}>{t("title")}</h1>
          <p className={loginStyles.subtitle}>{t("subtitle")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="login-id" className={loginStyles.label}>{t("idLabel")}</Label>
          <Input id="login-id" className={loginStyles.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus placeholder={t("idPlaceholder")} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="login-password" className={loginStyles.label}>{t("passwordLabel")}</Label>
          <LoginPasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" showLabel={t("show")} hideLabel={t("hide")} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" className={loginStyles.button} disabled={loading}>
          {loading ? t("signingIn") : t("signIn")}
        </Button>
        <p className={loginStyles.help}>{t("help")}</p>
      </form>
    </LoginLayout>
  );
}
