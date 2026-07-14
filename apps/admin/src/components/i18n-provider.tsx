"use client";

import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import en from "../../messages/en.json";
import bn from "../../messages/bn.json";

// Non-routing mode — no [locale] URL segment (this is an authenticated app
// with a deep existing route tree and no SEO surface, unlike the public
// website). Locale is sourced from User.lang_pref, the same field
// sendNotification() already keys its bilingual templates off, rather than
// a second, parallel preference store.
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
