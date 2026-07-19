"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

const PAGES = [
  { key: "about", labelKey: "navAbout", subheading: "groupInstitution" },
  { key: "history", labelKey: "navHistory", subheading: "groupInstitution" },
  { key: "mission_vision", labelKey: "navMissionVision", subheading: "groupInstitution" },
  { key: "facilities", labelKey: "navFacilities", subheading: "groupInstitution" },
  { key: "achievements", labelKey: "navAchievements", subheading: "groupInstitution" },
  { key: "admission_info", labelKey: "navAdmissionInfo", subheading: "groupInstitution" },
  { key: "principal_message", labelKey: "navPrincipalMessage", subheading: "groupLeadership" },
  { key: "vice_principal_message", labelKey: "navVicePrincipalMessage", subheading: "groupLeadership" },
  { key: "chairman_message", labelKey: "navChairmanMessage", subheading: "groupLeadership" },
] as const;

export default function AboutIndexPage() {
  const t = useTranslations("about");
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p, i) => (
            <div key={p.key}>
              {p.subheading !== PAGES[i - 1]?.subheading && (
                <p className={`px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 ${i > 0 ? "mt-3 pt-3 border-t" : ""}`}>
                  {t(p.subheading)}
                </p>
              )}
              <Link href={`/about/${p.key}`} className="block rounded-md px-3 py-2 hover:bg-gray-50">
                {t(p.labelKey)}
              </Link>
            </div>
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
