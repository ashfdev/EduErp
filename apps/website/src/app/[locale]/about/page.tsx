"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

const PAGES = [
  { key: "about", labelKey: "navAbout" },
  { key: "history", labelKey: "navHistory" },
  { key: "mission_vision", labelKey: "navMissionVision" },
  { key: "principal_message", labelKey: "navPrincipalMessage" },
  { key: "vice_principal_message", labelKey: "navVicePrincipalMessage" },
  { key: "chairman_message", labelKey: "navChairmanMessage" },
  { key: "facilities", labelKey: "navFacilities" },
  { key: "achievements", labelKey: "navAchievements" },
  { key: "admission_info", labelKey: "navAdmissionInfo" },
] as const;

export default function AboutIndexPage() {
  const t = useTranslations("about");
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.key} href={`/about/${p.key}`} className="block rounded-md px-3 py-2 hover:bg-gray-50">
              {t(p.labelKey)}
            </Link>
          ))}
        </aside>
        <div className="md:col-span-3">
          <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
          <p className="text-gray-600">{t("selectPrompt")}</p>
        </div>
      </div>
    </main>
  );
}
