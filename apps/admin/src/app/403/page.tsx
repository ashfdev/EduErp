"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ForbiddenPage() {
  const t = useTranslations("forbidden");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("message")}</p>
      <Link href="/dashboard" className="text-primary hover:underline">
        {t("backToDashboard")}
      </Link>
    </div>
  );
}
