"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { StaticPageContent } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import {
  Info, History, Target, Building2, Trophy, BookOpen,
  MessageCircle, ChevronRight, FileQuestion
} from "lucide-react";

const PAGES = [
  { key: "about", labelKey: "navAbout", subheading: "groupInstitution", icon: Info, color: "text-green-700 bg-green-50" },
  { key: "history", labelKey: "navHistory", subheading: "groupInstitution", icon: History, color: "text-blue-600 bg-blue-50" },
  { key: "mission_vision", labelKey: "navMissionVision", subheading: "groupInstitution", icon: Target, color: "text-purple-600 bg-purple-50" },
  { key: "facilities", labelKey: "navFacilities", subheading: "groupInstitution", icon: Building2, color: "text-cyan-600 bg-cyan-50" },
  { key: "achievements", labelKey: "navAchievements", subheading: "groupInstitution", icon: Trophy, color: "text-amber-600 bg-amber-50" },
  { key: "admission_info", labelKey: "navAdmissionInfo", subheading: "groupInstitution", icon: BookOpen, color: "text-rose-600 bg-rose-50" },
  { key: "principal_message", labelKey: "navPrincipalMessage", subheading: "groupLeadership", icon: MessageCircle, color: "text-green-700 bg-green-50" },
  { key: "vice_principal_message", labelKey: "navVicePrincipalMessage", subheading: "groupLeadership", icon: MessageCircle, color: "text-blue-600 bg-blue-50" },
  { key: "chairman_message", labelKey: "navChairmanMessage", subheading: "groupLeadership", icon: MessageCircle, color: "text-purple-600 bg-purple-50" },
] as const;

export default function AboutSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTranslations("about");
  const tCommon = useTranslations("common");
  const { data: page, error, notFound, refetch } = useContent<StaticPageContent>(`/pages/${slug}`);

  const currentPage = PAGES.find((p) => p.key === slug);
  const Icon = currentPage?.icon ?? FileQuestion;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-1 sticky top-24">
              {PAGES.map((p, i) => {
                const SideIcon = p.icon;
                const isActive = p.key === slug;
                const isNewGroup = p.subheading !== PAGES[i - 1]?.subheading;
                return (
                  <div key={p.key}>
                    {isNewGroup && (
                      <p className={`px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${i > 0 ? "mt-4 pt-4 border-t border-slate-100 mb-2" : "mb-2"}`}>
                        {t(p.subheading)}
                      </p>
                    )}
                    <Link
                      href={`/about/${p.key}`}
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
                  </div>
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
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-14 text-center">
                <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="h-8 w-8 text-slate-400" />
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">Page Not Configured</h2>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">{t("notConfigured")}</p>
              </div>
            )}

            {page && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Page Header */}
                <div className="border-b border-slate-100 px-6 sm:px-10 py-7 flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${currentPage?.color ?? "bg-green-50 text-green-700"}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
                    {page.title_en ?? t(currentPage?.labelKey ?? "navAbout")}
                  </h1>
                </div>

                {/* Rich Content */}
                <div
                  className="
                    px-6 sm:px-10 py-8
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
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-pulse">
                <div className="border-b border-slate-100 px-10 py-7">
                  <div className="h-7 bg-slate-100 rounded-xl w-2/5" />
                </div>
                <div className="px-10 py-8 space-y-4">
                  <div className="h-4 bg-slate-100 rounded w-full" />
                  <div className="h-4 bg-slate-100 rounded w-11/12" />
                  <div className="h-4 bg-slate-100 rounded w-4/5" />
                  <div className="h-4 bg-slate-100 rounded w-full mt-6" />
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
