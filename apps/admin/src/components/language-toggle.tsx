"use client";

import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";

export function LanguageToggle() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const current = user.lang_pref === "EN" ? "EN" : "BN";
  const next = current === "EN" ? "BN" : "EN";

  async function toggle() {
    // Optimistic — flip immediately, reconcile if the request fails.
    useAuthStore.setState({ user: { ...user!, lang_pref: next } });
    try {
      await api.put("/api/auth/lang", { lang_pref: next });
    } catch {
      useAuthStore.setState({ user: { ...user!, lang_pref: current } });
    }
  }

  return (
    <button onClick={toggle} className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent" aria-label="Switch language">
      {next === "BN" ? "বাংলা" : "English"}
    </button>
  );
}
