"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { JobPosting } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { Briefcase, ArrowRight, Clock, Building2 } from "lucide-react";

export default function CareersPage() {
  const t = useTranslations("careers");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<JobPosting[]>("/jobs");
  const jobs = data ?? [];

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        <div className="mb-10 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-3">{t("title")}</h1>
          <p className="text-slate-500 text-base leading-relaxed max-w-2xl mx-auto">{t("subtitle")}</p>
        </div>

        {!jobs.length && (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 text-center ring-1 ring-slate-100 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4">
              <Briefcase className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Openings</h3>
            <p className="text-slate-500 max-w-sm mx-auto">{t("noOpenings")}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5">
          {jobs.map((job) => (
            <Link 
              key={job.id} 
              href={`/careers/${job.id}`} 
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-5 rounded-3xl bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/80 p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgb(59,130,246,0.15)] hover:border-blue-100"
            >
              <div className="flex-1">
                <h2 className="text-xl font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors mb-3">
                  {job.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs mb-4">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-blue-700 font-bold ring-1 ring-slate-100 shadow-sm">
                    <Building2 className="h-3.5 w-3.5 text-blue-500" />
                    {job.department ?? t("generalDepartment")}
                  </div>
                  {job.deadline && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-blue-700 font-bold ring-1 ring-slate-100 shadow-sm">
                      <Clock className="h-3.5 w-3.5 text-blue-500" />
                      {t("applyBy", { date: new Date(job.deadline).toLocaleDateString() })}
                    </div>
                  )}
                </div>
                <p className="text-slate-600 leading-relaxed text-sm line-clamp-2 max-w-2xl">{job.description}</p>
              </div>

              <div className="shrink-0 pt-4 sm:pt-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-slate-100 shadow-sm group-hover:bg-blue-600 group-hover:text-white group-hover:ring-blue-500 transition-all duration-300 transform group-hover:scale-110 group-hover:shadow-lg">
                  <ArrowRight className="h-6 w-6" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
