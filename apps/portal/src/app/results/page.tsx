"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, StatusBadge, LoadingSpinner } from "@education-erp/ui";

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

function ResultsContent() {
  const { activeStudentId } = useAuthStore();
  const { terms } = useInstitution();
  const t = useTranslations("results");
  const [examTypeId, setExamTypeId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");

  // Mirrors the public website result page — university (semester-based)
  // students don't get this filter, school/college/madrasah do.
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

  const { data, isLoading } = useQuery<ResultSummary[]>({
    queryKey: ["portal", "results", activeStudentId, examTypeId, academicYearId],
    queryFn: async () =>
      (
        await api.get(`/api/portal/student/${activeStudentId}/results`, {
          params: { exam_type_config_id: examTypeId || undefined, academic_year_id: academicYearId || undefined },
        })
      ).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      {showExamFilters && (
        <div className="grid grid-cols-2 gap-2">
          <select value={examTypeId} onChange={(e) => setExamTypeId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
            <option value="">{t("anyExam")}</option>
            {examTypes?.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}
          </select>
          <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
            <option value="">{t("anyYear")}</option>
            {academicYears?.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? t("currentSuffix") : ""}</option>)}
          </select>
        </div>
      )}

      {!data?.length && <p className="text-sm text-gray-500">{t("noResultFound")}</p>}
      {data?.map((r) => (
        <Link key={r.exam_id} href={`/results/${r.exam_id}`}>
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{r.exam_name}</p>
                <p className="text-xs text-gray-500">{r.has_failed ? t("failed") : `GPA ${r.total_gpa}`}</p>
              </div>
              <StatusBadge status={r.has_failed ? "FAILED" : r.overall_grade} />
            </CardContent>
          </Card>
        </Link>
      ))}
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
