"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { StaticPageContent } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { BookOpen, Scale, FileText, Shield, ChevronRight } from "lucide-react";

const PAGES = [
  { key: "course_curriculum", labelKey: "navCourseCurriculum", icon: BookOpen, color: "text-blue-600 bg-blue-50" },
  { key: "grading_system", labelKey: "navGradingSystem", icon: Scale, color: "text-green-700 bg-green-50" },
  { key: "academic_regulations", labelKey: "navAcademicRegulations", icon: FileText, color: "text-purple-600 bg-purple-50" },
  { key: "policies", labelKey: "navPolicies", icon: Shield, color: "text-amber-600 bg-amber-50" },
] as const;

export default function AcademicSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTranslations("academic");
  const tCommon = useTranslations("common");
  const { data: page, error, notFound, refetch } = useContent<StaticPageContent>(`/pages/${slug}`);

  const currentPage = PAGES.find((p) => p.key === slug);
  const Icon = currentPage?.icon ?? FileText;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-1">
              {PAGES.map((p) => {
                const SideIcon = p.icon;
                const isActive = p.key === slug;
                return (
                  <Link
                    key={p.key}
                    href={`/academic/${p.key}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all group ${
                      isActive
                        ? "bg-green-50 text-green-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-xl flex items-center justify-center shrink-0 ${isActive ? p.color : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"}`}>
                      <SideIcon className="h-3.5 w-3.5" />
                    </div>
                    <span className="leading-tight">{t(p.labelKey)}</span>
                    {isActive && <ChevronRight className="h-4 w-4 ml-auto opacity-60" />}
                  </Link>
                );
              })}
            </div>
          </aside>

          {/* Content */}
          <div className="lg:col-span-3">
            {error && (
              <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
            )}
            {notFound && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
                <Icon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">{t("notConfigured")}</p>
              </div>
            )}
            {page && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Content Header */}
                <div className="border-b border-slate-100 px-6 sm:px-8 py-6 flex items-center gap-4">
                  <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${currentPage?.color ?? "bg-green-50 text-green-700"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    {page.title_en ?? t(currentPage?.labelKey ?? "navCourseCurriculum")}
                  </h1>
                </div>

                {/* Rich Content */}
                <div
                  className="
                    px-6 sm:px-8 py-8
                    prose prose-slate max-w-none
                    prose-headings:font-extrabold prose-headings:text-slate-900 prose-headings:tracking-tight
                    prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:border-l-4 prose-h2:border-green-500 prose-h2:pl-4
                    prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-green-700
                    prose-p:text-slate-600 prose-p:leading-[1.85] prose-p:text-[15px]
                    prose-ul:my-4 prose-li:text-slate-600 prose-li:text-[15px] prose-li:leading-relaxed prose-li:my-1.5
                    prose-li:marker:text-green-500
                    prose-ol:my-4
                    prose-strong:text-slate-800 prose-strong:font-bold
                    prose-a:text-green-700 prose-a:font-semibold prose-a:no-underline hover:prose-a:underline
                    prose-blockquote:border-l-4 prose-blockquote:border-green-400 prose-blockquote:bg-green-50/50 prose-blockquote:rounded-r-xl prose-blockquote:py-1 prose-blockquote:text-slate-600 prose-blockquote:italic
                    prose-table:rounded-xl prose-table:overflow-hidden prose-table:border prose-table:border-slate-200
                    prose-th:bg-slate-50 prose-th:text-slate-700 prose-th:font-bold prose-th:text-sm
                    prose-td:text-slate-600 prose-td:text-sm
                    prose-hr:border-slate-200 prose-hr:my-8
                  "
                  dangerouslySetInnerHTML={{ __html: page.content_en ?? "" }}
                />
              </div>
            )}

            {/* Loading skeleton */}
            {!page && !error && !notFound && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4 animate-pulse">
                <div className="h-6 bg-slate-100 rounded-xl w-1/3" />
                <div className="space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-full" />
                  <div className="h-4 bg-slate-100 rounded w-5/6" />
                  <div className="h-4 bg-slate-100 rounded w-4/5" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
