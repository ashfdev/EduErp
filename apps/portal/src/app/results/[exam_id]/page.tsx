"use client";

import { Fragment, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner, ErrorState } from "@education-erp/ui";
import { ChevronDown, ChevronUp } from "lucide-react";

interface MarkComponentRow {
  label: string;
  max_marks: number;
  value: number | null;
  not_entered: boolean;
}
interface SubjectResult {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  teacher_name: string | null;
  not_conducted: boolean;
  marks_theory: number | null;
  marks_practical: number | null;
  marks_total: number | null;
  grade_letter: string | null;
  is_absent: boolean;
  has_mark_components: boolean;
  mark_components: MarkComponentRow[];
}
interface ResultDetail {
  exam_id: string;
  exam_name: string;
  subjects: SubjectResult[];
  total_gpa: number;
  overall_grade: string;
  has_failed: boolean;
}

function ResultDetailContent() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const { activeStudentId, students } = useAuthStore();
  const { type: institutionType, terms } = useInstitution();
  const t = useTranslations("resultDetail");
  const tCommon = useTranslations("common");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeStudent = students.find((s) => s.id === activeStudentId);
  const isUniversity = institutionType === "UNIVERSITY";

  const { data, isLoading, isError, refetch } = useQuery<ResultDetail[]>({
    queryKey: ["portal", "results", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/results`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const result = data?.find((r) => r.exam_id === exam_id);

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;
  if (!result) return <p className="p-4 text-sm text-gray-500">{tCommon("resultNotFound")}</p>;

  function toggleExpand(subjectId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  async function printCard() {
    const res = await api.get(`/api/portal/student/${activeStudentId}/results/${exam_id}/marksheet`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900">{result.exam_name}</h1>
        <span className="text-xs text-gray-500">
          {isUniversity
            ? activeStudent?.current_section?.name ?? ""
            : `${activeStudent?.current_class?.name_en ?? ""}${activeStudent?.current_section ? ` — ${activeStudent.current_section.name}` : ""}`}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                {isUniversity ? (
                  <>
                    <th className="p-2 font-medium">{t("courseCode")}</th>
                    <th className="p-2 font-medium">{t("subject")}</th>
                    <th className="p-2 font-medium">{t("teacher")}</th>
                  </>
                ) : (
                  <th className="p-2 font-medium">{t("subject")}</th>
                )}
                <th className="p-2 font-medium text-right">{t("total")}</th>
                <th className="p-2 font-medium text-center">{t("grade")}</th>
                <th className="p-2 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {result.subjects.map((s) => {
                const isOpen = expanded.has(s.subject_id);
                return (
                  <Fragment key={s.subject_id}>
                    <tr className="border-b">
                      {isUniversity ? (
                        <>
                          <td className="p-2 text-gray-500">{s.subject_code}</td>
                          <td className="p-2 font-medium text-gray-800">{s.subject_name}</td>
                          <td className="p-2 text-gray-500">{s.teacher_name ?? "—"}</td>
                        </>
                      ) : (
                        <td className="p-2 font-medium text-gray-800">{s.subject_name}</td>
                      )}
                      <td className="p-2 text-right font-medium">
                        {s.not_conducted ? <span className="text-gray-400">{t("notConducted")}</span> : s.is_absent ? t("absent") : s.marks_total ?? "—"}
                      </td>
                      <td className="p-2 text-center">{s.not_conducted ? "—" : s.grade_letter ?? "—"}</td>
                      <td className="p-2 text-right">
                        {(s.has_mark_components || s.is_absent || s.not_conducted) && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(s.subject_id)}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600"
                          >
                            {isOpen ? t("hideResult") : t("viewResult")}
                            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-gray-50/60">
                        <td colSpan={isUniversity ? 6 : 4} className="p-2">
                          {s.not_conducted ? (
                            <p className="text-gray-400">{t("notConducted")}</p>
                          ) : s.is_absent ? (
                            <p className="text-gray-500">{t("absent")}</p>
                          ) : s.has_mark_components ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                              {s.mark_components.map((c, i) => (
                                <div key={i} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 border border-gray-100">
                                  <span className="text-gray-600">{c.label}</span>
                                  <span className="font-medium text-gray-800">
                                    {c.not_entered ? <span className="text-gray-400">{t("notEntered")}</span> : `${c.value}/${c.max_marks}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500">
                              {s.marks_theory !== null && `${t("subject")}: ${s.marks_theory}`}
                              {s.marks_practical !== null && s.marks_practical > 0 && ` · Practical: ${s.marks_practical}`}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between px-1 text-sm">
        <span className="font-medium text-gray-700">{t("totalGpa", { gpa: result.total_gpa })}</span>
        <span className="font-medium text-gray-700">{t("overallGrade", { grade: result.has_failed ? "F" : result.overall_grade })}</span>
      </div>

      <Button className="w-full" onClick={printCard}>{t("printCard")}</Button>
      {!isUniversity && <p className="sr-only">{terms.term_class}</p>}
    </div>
  );
}

export default function ResultDetailPage() {
  return (
    <PortalShell>
      <ResultDetailContent />
    </PortalShell>
  );
}
