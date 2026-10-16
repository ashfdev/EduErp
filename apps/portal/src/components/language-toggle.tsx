"use client";

import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { cn } from "@education-erp/ui";

export function LanguageToggle({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const current = user.lang_pref === "EN" ? "EN" : "BN";
  const next = current === "EN" ? "BN" : "EN";

  async function toggle() {
    useAuthStore.setState({ user: { ...user!, lang_pref: next } });
    try {
      await api.put("/api/auth/lang", { lang_pref: next });
    } catch {
      useAuthStore.setState({ user: { ...user!, lang_pref: current } });
    }
  }

  return (
    <button onClick={toggle} className={cn("flex h-10 items-center rounded-md border px-3 text-xs font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} aria-label="Switch language">
      {next === "BN" ? "বাংলা" : "English"}
    </button>
  );
}
