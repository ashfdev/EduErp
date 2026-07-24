"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useContent } from "@/hooks/use-content";
import type { DownloadItem } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { Download, FileText, BookOpen, Calendar, Clock, LayoutGrid, FileStack, BarChart3, File, ExternalLink } from "lucide-react";

const CATEGORIES = [
  { key: "SYLLABUS", label: "Syllabus", icon: BookOpen, color: "bg-blue-50 text-blue-600 border-blue-100" },
  { key: "EXAM_SCHEDULE", label: "Exam Schedule", icon: Calendar, color: "bg-purple-50 text-purple-600 border-purple-100" },
  { key: "CLASS_ROUTINE", label: "Class Routine", icon: Clock, color: "bg-green-50 text-green-700 border-green-100" },
  { key: "ACADEMIC_CALENDAR", label: "Academic Calendar", icon: LayoutGrid, color: "bg-orange-50 text-orange-600 border-orange-100" },
  { key: "FORMS", label: "Forms", icon: FileText, color: "bg-rose-50 text-rose-600 border-rose-100" },
  { key: "RESULTS", label: "Results", icon: BarChart3, color: "bg-amber-50 text-amber-600 border-amber-100" },
  { key: "CIRCULARS", label: "Circulars", icon: FileStack, color: "bg-cyan-50 text-cyan-600 border-cyan-100" },
  { key: "OTHERS", label: "Others", icon: File, color: "bg-slate-100 text-slate-500 border-slate-200" },
];

export default function DownloadsPage() {
  const t = useTranslations("downloads");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<DownloadItem[]>("/downloads");
  const downloads = data ?? [];
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (error) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </div>
    );
  }

  const availableCategories = CATEGORIES.filter((cat) => downloads.some((d) => d.category === cat.key));
  const displayCategory = activeCategory ?? availableCategories[0]?.key ?? null;
  const displayedItems = downloads.filter((d) => d.category === displayCategory);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <Download className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{t("title")}</h1>
          </div>
          <p className="text-slate-500 text-sm ml-[52px]">Download syllabi, schedules, forms, and other academic resources.</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8">

        {!downloads.length && data !== undefined && (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <Download className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">{t("noFiles")}</p>
          </div>
        )}

        {availableCategories.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            {/* Category Sidebar */}
            <aside className="lg:col-span-1">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-1">
                {availableCategories.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = cat.key === displayCategory;
                  const count = downloads.filter((d) => d.category === cat.key).length;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setActiveCategory(cat.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all text-left ${
                        isActive
                          ? "bg-green-50 text-green-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <div className={`h-7 w-7 rounded-xl flex items-center justify-center shrink-0 border ${isActive ? cat.color : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="flex-1">{cat.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Files List */}
            <div className="lg:col-span-3 space-y-3">
              {displayedItems.map((d) => {
                const cat = CATEGORIES.find((c) => c.key === d.category);
                const Icon = cat?.icon ?? File;
                return (
                  <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-5 flex items-center gap-4">
                    <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 border ${cat?.color ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm mb-1 line-clamp-1">{d.title}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        <span>·</span>
                        <span>{t("downloadsCount", { count: d.download_count })}</span>
                      </div>
                    </div>
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 shrink-0 rounded-xl bg-green-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-800 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("download")}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
