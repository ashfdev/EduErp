"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { StaticPageContent } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

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

export default function AboutSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTranslations("about");
  const tCommon = useTranslations("common");
  const { data: page, error, notFound, refetch } = useContent<StaticPageContent>(`/pages/${slug}`);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col lg:flex-row gap-10">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="sticky top-28 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 px-3 text-sm font-bold uppercase tracking-wider text-slate-400">
              {t("navAbout")}
            </h3>
            <nav className="space-y-1">
              {PAGES.map((p, i) => {
                const isActive = p.key === slug;
                return (
                  <div key={p.key}>
                    {p.subheading !== PAGES[i - 1]?.subheading && (
                      <p className={`px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${i > 0 ? "mt-3 pt-3 border-t border-slate-100" : ""}`}>
                        {t(p.subheading)}
                      </p>
                    )}
                    <Link
                      href={`/about/${p.key}`}
                      className={`block rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {t(p.labelKey)}
                    </Link>
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10 min-h-[500px]">
            {error && (
              <div className="flex h-full items-center justify-center pt-16 pb-20">
                <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
              </div>
            )}
            {notFound && (
              <div className="flex h-full flex-col items-center justify-center text-center space-y-4 pt-16 pb-20">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl">
                  📄
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Page Not Configured</h2>
                  <p className="text-slate-500 max-w-sm">{t("notConfigured")}</p>
                </div>
              </div>
            )}
            {page && (
              <article className="prose prose-slate max-w-none prose-headings:text-slate-800 prose-a:text-blue-600 hover:prose-a:text-blue-700">
                <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-slate-900 border-b border-slate-100 pb-4">
                  {page.title_en ?? t(PAGES.find((p) => p.key === slug)?.labelKey ?? "navAbout")}
                </h1>
                <div dangerouslySetInnerHTML={{ __html: page.content_en ?? "" }} />
              </article>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
