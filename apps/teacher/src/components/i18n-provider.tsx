"use client";

import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import en from "../../messages/en.json";
import bn from "../../messages/bn.json";

// Non-routing mode — locale sourced from User.lang_pref (see apps/admin's
// identical provider for the full rationale).
const MESSAGES: Record<"EN" | "BN", typeof en> = { EN: en, BN: bn };

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const userLang = useAuthStore((s) => s.user?.lang_pref);
  const [locale, setLocale] = useState<"EN" | "BN">((userLang as "EN" | "BN") ?? "BN");

  useEffect(() => {
    if (userLang === "EN" || userLang === "BN") setLocale(userLang);
  }, [userLang]);

  return (
    <NextIntlClientProvider locale={locale.toLowerCase()} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}
