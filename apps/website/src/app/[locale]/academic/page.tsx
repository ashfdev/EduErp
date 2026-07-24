"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { BookOpen, Scale, FileText, Shield, ChevronRight } from "lucide-react";

const PAGES = [
  { key: "course_curriculum", labelKey: "navCourseCurriculum", icon: BookOpen, color: "bg-blue-50 text-blue-600", desc: "Explore subjects and syllabi offered across classes" },
  { key: "grading_system", labelKey: "navGradingSystem", icon: Scale, color: "bg-green-50 text-green-700", desc: "Understand how grades and GPAs are calculated" },
  { key: "academic_regulations", labelKey: "navAcademicRegulations", icon: FileText, color: "bg-purple-50 text-purple-600", desc: "Rules and standards governing academic conduct" },
  { key: "policies", labelKey: "navPolicies", icon: Shield, color: "bg-amber-50 text-amber-600", desc: "Institutional policies that apply to all students" },
] as const;

export default function AcademicIndexPage() {
  const t = useTranslations("academic");
  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">{t("title")}</h1>
          <p className="text-slate-500 text-sm">{t("selectPrompt")}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PAGES.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.key}
                href={`/academic/${p.key}`}
                className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-6 flex items-start gap-5"
              >
                <div className={`shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${p.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 text-base mb-1 group-hover:text-green-700 transition-colors">{t(p.labelKey)}</h2>
                  <p className="text-sm text-slate-500 leading-relaxed">{p.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-green-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
