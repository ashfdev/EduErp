"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { StaticPageContent } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

const PAGES = [
  { key: "course_curriculum", labelKey: "navCourseCurriculum" },
  { key: "grading_system", labelKey: "navGradingSystem" },
  { key: "academic_regulations", labelKey: "navAcademicRegulations" },
  { key: "policies", labelKey: "navPolicies" },
] as const;

export default function AcademicSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTranslations("academic");
  const tCommon = useTranslations("common");
  const { data: page, error, notFound, refetch } = useContent<StaticPageContent>(`/pages/${slug}`);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.key} href={`/academic/${p.key}`} className={`block rounded-md px-3 py-2 hover:bg-gray-50 ${p.key === slug ? "bg-gray-100 font-medium" : ""}`}>
              {t(p.labelKey)}
            </Link>
          ))}
        </aside>
        <div className="md:col-span-3">
          {error && <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />}
          {notFound && <p className="text-sm text-gray-500">{t("notConfigured")}</p>}
          {page && (
            <>
              <h1 className="mb-4 text-2xl font-semibold">{page.title_en ?? t(PAGES.find((p) => p.key === slug)?.labelKey ?? "navCourseCurriculum")}</h1>
              <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: page.content_en ?? "" }} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
