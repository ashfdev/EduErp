"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button, Input, Label } from "@education-erp/ui";

export default function TeacherLoginPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const t = useTranslations("login");

  const { data: institution } = useQuery<{ logo_url: string | null; name_en: string; teacher_login_bg_url: string | null }>({
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
      const res = await api.post("/api/auth/login", { identifier, password, portal: "admin" });
      setSession(res.data.data);
      router.replace("/");
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full bg-white">
      
      {/* Mobile Full Background Illustration */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center lg:hidden"
        style={{
          backgroundImage: `url('${institution?.teacher_login_bg_url ?? "/assets/login-illustration.png"}')`,
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
              backgroundImage: `url('${institution?.teacher_login_bg_url ?? "/assets/login-illustration.png"}')`,
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
              {t("title")}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {t("subtitle")}
            </p>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
            <form onSubmit={submit} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">{t("idLabel")}</Label>
                <Input className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm transition-all focus:bg-white" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus placeholder="01XXXXXXXXX" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">{t("passwordLabel")}</Label>
                <Input className="rounded-lg bg-[#f8fafc] px-4 py-6 text-sm transition-all focus:bg-white" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <span className="font-semibold">{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full rounded-lg py-6 text-base font-bold bg-[#0066ff] hover:bg-blue-700 transition-all text-white" disabled={loading}>
                {loading ? t("signingIn") : t("signIn")}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
