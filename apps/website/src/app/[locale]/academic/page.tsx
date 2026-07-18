"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

const PAGES = [
  { key: "course_curriculum", labelKey: "navCourseCurriculum" },
  { key: "grading_system", labelKey: "navGradingSystem" },
  { key: "academic_regulations", labelKey: "navAcademicRegulations" },
  { key: "policies", labelKey: "navPolicies" },
] as const;

export default function AcademicIndexPage() {
  const t = useTranslations("academic");
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.key} href={`/academic/${p.key}`} className="block rounded-md px-3 py-2 hover:bg-gray-50">
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
