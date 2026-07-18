"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button, Input, Label } from "@education-erp/ui";

export default function PortalLoginPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const t = useTranslations("login");

  const { data: institution } = useQuery<{ logo_url: string | null; name_en: string }>({
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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-white shadow-sm ring-4 ring-primary/5">
            {institution?.logo_url ? (
              <img src={institution.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl">🏫</span>
            )}
          </div>
          <p className="text-xl font-bold tracking-tight text-slate-800">{institution?.name_en ?? "Education ERP"}</p>
        </div>
        
        <div className="w-full rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--primary, #1a3c4a)" }}>{t("title")}</h1>
        <p className="mb-6 text-sm text-gray-500">{t("subtitle")}</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("idLabel")}</Label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t("idPlaceholder")} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t("passwordLabel")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? t("signingIn") : t("signIn")}</Button>
        </form>
        </div>
      </div>
    </main>
  );
}
