"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, StatusBadge, LoadingSpinner, ErrorState } from "@education-erp/ui";

interface ResultSummary {
  exam_id: string;
  exam_name: string;
  total_gpa: number;
  overall_grade: string;
  has_failed: boolean;
}
interface ExamTypeOption {
  id: string;
  name: string;
}
interface AcademicYearOption {
  id: string;
  label: string;
  is_active: boolean;
}

import { Award, ChevronRight, FileSearch, GraduationCap } from "lucide-react";

// (Skipping boilerplate above ResultsContent)
function ResultsContent() {
  const { activeStudentId } = useAuthStore();
  const { terms } = useInstitution();
  const t = useTranslations("results");
  const tCommon = useTranslations("common");
  const [examTypeId, setExamTypeId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");

  const showExamFilters = !terms.has_semesters;

  const { data: examTypes } = useQuery<ExamTypeOption[]>({
    queryKey: ["content", "exam-types"],
    queryFn: async () => (await api.get("/api/content/exam-types")).data.data,
    enabled: showExamFilters,
  });
  const { data: academicYears } = useQuery<AcademicYearOption[]>({
    queryKey: ["content", "academic-years"],
    queryFn: async () => (await api.get("/api/content/academic-years")).data.data,
    enabled: showExamFilters,
  });

  const { data, isLoading, isError, refetch } = useQuery<ResultSummary[]>({
    queryKey: ["portal", "results", activeStudentId, examTypeId, academicYearId],
    queryFn: async () =>
      (
        await api.get(`/api/portal/student/${activeStudentId}/results`, {
          params: { exam_type_config_id: examTypeId || undefined, academic_year_id: academicYearId || undefined },
        })
      ).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-100 p-2.5 text-amber-600">
          <Award className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
      </div>

      {showExamFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Exam Type</label>
            <select value={examTypeId} onChange={(e) => setExamTypeId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all">
              <option value="">{t("anyExam")}</option>
              {examTypes?.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Academic Year</label>
            <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all">
              <option value="">{t("anyYear")}</option>
              {academicYears?.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? t("currentSuffix") : ""}</option>)}
            </select>
          </div>
        </div>
      )}

      {!data?.length && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-slate-100 p-6 text-slate-400 mb-4">
            <FileSearch className="h-12 w-12" />
          </div>
          <p className="text-lg font-medium text-slate-600">{t("noResultFound")}</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting your filters or check back later.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {data?.map((r) => (
          <Link key={r.exam_id} href={`/results/${r.exam_id}`} className="group block h-full">
            <Card className="h-full border-0 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1 bg-gradient-to-b from-white to-slate-50/50">
              <CardContent className="p-0">
                <div className="flex items-start justify-between p-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`shrink-0 rounded-xl p-2.5 ${r.has_failed ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-base leading-snug group-hover:text-amber-600 transition-colors line-clamp-2">{r.exam_name}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-end justify-between p-5 bg-slate-50/50">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Final Result</p>
                    <div className="flex items-baseline gap-2">
                       <span className={`text-3xl font-bold tracking-tighter ${r.has_failed ? 'text-rose-600' : 'text-slate-900'}`}>
                         {r.has_failed ? t("failed") : r.total_gpa}
                       </span>
                       {!r.has_failed && <span className="text-sm font-bold text-slate-500 uppercase">GPA</span>}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-3">
                    <StatusBadge status={r.has_failed ? "FAILED" : r.overall_grade} />
                    <div className="flex items-center text-xs font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0">
                      View Details <ChevronRight className="ml-0.5 h-3 w-3" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <PortalShell>
      <ResultsContent />
    </PortalShell>
  );
}
