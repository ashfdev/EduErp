"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner, ErrorState } from "@education-erp/ui";
import { Award, BookOpen, FileSearch, GraduationCap, Hash, IdCard, Search, Users } from "lucide-react";

interface AcademicYearOption {
  id: string;
  label: string;
  is_active: boolean;
}

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
  grade_point: number | null;
  is_absent: boolean;
  has_mark_components: boolean;
  mark_components: MarkComponentRow[];
}
interface GradingLegendRow {
  range: string;
  grade_letter: string;
  grade_point: number;
  remarks: string | null;
}
interface ExamResult {
  exam_id: string;
  exam_name: string;
  academic_year_label: string;
  subjects: SubjectResult[];
  // Null when this exam has zero marks actually entered for the student yet
  // — never a fabricated 0.00/F, see the identical fix/comment on the
  // backend (portal.routes.ts).
  total_gpa: number | null;
  overall_grade: string | null;
  has_failed: boolean;
  grading_legend: GradingLegendRow[];
}
interface StudentInfo {
  name_en: string;
  student_uid: string;
  registration_no: string | null;
  photo_url: string | null;
  roll_no: string | null;
  program_name: string | null;
  class_name: string | null;
  section_name: string | null;
}
interface ResultsResponse {
  student: StudentInfo;
  exams: ExamResult[];
}

function ResultsContent() {
  const { activeStudentId } = useAuthStore();
  const { type: institutionType, terms } = useInstitution();
  const t = useTranslations("results");
  const td = useTranslations("resultDetail");
  const tCommon = useTranslations("common");

  const [academicYearId, setAcademicYearId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  // Only set once "Search" is clicked -- selecting a session/exam alone
  // never reveals a result, matching the reference UI's ask/search/load flow
  // instead of the old card-grid that showed every exam at once.
  const [searchedExamId, setSearchedExamId] = useState<string | null>(null);

  const isUniversity = institutionType === "UNIVERSITY";
  const gpaLabel = terms.has_semesters ? "SGPA" : "GPA";

  const { data: academicYears } = useQuery<AcademicYearOption[]>({
    queryKey: ["content", "academic-years"],
    queryFn: async () => (await api.get("/api/content/academic-years")).data.data,
  });

  const { data, isLoading, isError, refetch } = useQuery<ResultsResponse>({
    queryKey: ["portal", "results", activeStudentId, academicYearId],
    queryFn: async () =>
      (
        await api.get(`/api/portal/student/${activeStudentId}/results`, {
          params: { academic_year_id: academicYearId || undefined },
        })
      ).data.data,
    enabled: !!activeStudentId && !!academicYearId,
  });

  // A stale exam id from a previously-selected session must never carry
  // over once the session changes.
  useEffect(() => {
    setSelectedExamId("");
    setSearchedExamId(null);
  }, [academicYearId]);

  const examOptions = useMemo(() => data?.exams ?? [], [data]);
  const result = useMemo(() => (searchedExamId ? examOptions.find((e) => e.exam_id === searchedExamId) : undefined), [examOptions, searchedExamId]);

  const hasAnyCode = !!result?.subjects.some((s) => s.subject_code);
  const totalMarks = result ? result.subjects.reduce((sum, s) => sum + (s.marks_total ?? 0), 0) : 0;

  async function printCard() {
    if (!searchedExamId) return;
    const res = await api.get(`/api/portal/student/${activeStudentId}/results/${searchedExamId}/marksheet`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-100 p-2.5 text-amber-600">
          <Award className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Academic Result</h1>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">{t("selectSession")}</label>
              <select
                value={academicYearId}
                onChange={(e) => setAcademicYearId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
              >
                <option value="">{t("selectSessionPlaceholder")}</option>
                {academicYears?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                    {y.is_active ? t("currentSuffix") : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">{t("selectExam")}</label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                disabled={!academicYearId || isLoading}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all disabled:opacity-50"
              >
                <option value="">{academicYearId ? t("selectExamPlaceholder") : t("selectSessionFirst")}</option>
                {examOptions.map((e) => (
                  <option key={e.exam_id} value={e.exam_id}>
                    {e.exam_name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="sm:w-auto w-full gap-2"
              disabled={!selectedExamId}
              onClick={() => setSearchedExamId(selectedExamId)}
            >
              <Search className="h-4 w-4" />
              {t("search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!searchedExamId && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-slate-100 p-6 text-slate-400 mb-4">
            <FileSearch className="h-12 w-12" />
          </div>
          <p className="text-base font-medium text-slate-600">{t("searchPrompt")}</p>
        </div>
      )}

      {searchedExamId && isLoading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {searchedExamId && isError && (
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      )}

      {searchedExamId && !isLoading && !isError && !result && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-slate-100 p-6 text-slate-400 mb-4">
            <FileSearch className="h-12 w-12" />
          </div>
          <p className="text-base font-medium text-slate-600">{t("noResultFound")}</p>
        </div>
      )}

      {result && data && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
          <Card>
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-base font-bold text-slate-800">
                <GraduationCap className="h-5 w-5 text-amber-600" />
                {t("studentInformation")}
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="text-base font-bold text-indigo-700">{data.student.name_en}</p>
                {isUniversity && data.student.program_name && (
                  <p className="flex items-center gap-2 text-slate-600">
                    <BookOpen className="h-3.5 w-3.5 text-slate-400" /> {data.student.program_name}
                  </p>
                )}
                {!isUniversity && data.student.class_name && (
                  <p className="flex items-center gap-2 text-slate-600">
                    <BookOpen className="h-3.5 w-3.5 text-slate-400" /> {terms.term_class}: {data.student.class_name}
                  </p>
                )}
                {data.student.section_name && (
                  <p className="flex items-center gap-2 text-slate-600">
                    <Users className="h-3.5 w-3.5 text-slate-400" /> {isUniversity ? t("batch") : terms.term_section}: {data.student.section_name}
                  </p>
                )}
                <p className="flex items-center gap-2 text-slate-600">
                  <IdCard className="h-3.5 w-3.5 text-slate-400" /> {t("studentId")}: {data.student.student_uid}
                </p>
                {data.student.registration_no && (
                  <p className="flex items-center gap-2 text-slate-600">
                    <Hash className="h-3.5 w-3.5 text-slate-400" /> {terms.term_registration}: {data.student.registration_no}
                  </p>
                )}
                <p className="flex items-center gap-2 font-semibold text-slate-800 pt-1">
                  {result.total_gpa === null ? (
                    <span className="text-slate-500 font-medium">{t("marksNotEntered")}</span>
                  ) : (
                    <>
                      {gpaLabel} {t("of")} {result.exam_name}: {result.has_failed ? "F" : result.total_gpa}
                    </>
                  )}
                </p>
              </div>

              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                      <th className="p-2 font-semibold">{t("sl")}</th>
                      {hasAnyCode && <th className="p-2 font-semibold">{td("courseCode")}</th>}
                      <th className="p-2 font-semibold">{t("courseTitle")}</th>
                      <th className="p-2 font-semibold text-right">{td("total")}</th>
                      <th className="p-2 font-semibold text-center">{td("grade")}</th>
                      <th className="p-2 font-semibold text-right">{t("gradePoint")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.subjects.map((s, i) => (
                      <tr key={s.subject_id} className="border-b border-slate-100">
                        <td className="p-2 text-slate-500">{i + 1}</td>
                        {hasAnyCode && <td className="p-2 text-slate-500">{s.subject_code || "—"}</td>}
                        <td className="p-2 font-medium text-slate-800">{s.subject_name}</td>
                        <td className="p-2 text-right">
                          {s.not_conducted ? <span className="text-slate-400">{td("notConducted")}</span> : s.is_absent ? td("absent") : s.marks_total ?? "—"}
                        </td>
                        <td className="p-2 text-center">{s.not_conducted ? "—" : s.grade_letter ?? "—"}</td>
                        <td className="p-2 text-right">{s.not_conducted || s.is_absent ? "—" : s.grade_point ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-slate-800">
                      <td className="p-2" colSpan={hasAnyCode ? 2 : 1}>
                        {t("total")}
                      </td>
                      <td className="p-2">{t("totalMarks")}</td>
                      <td className="p-2 text-right">{totalMarks}</td>
                      <td className="p-2 text-center">{gpaLabel}</td>
                      <td className="p-2 text-right">{result.total_gpa ?? "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <Button className="w-full" onClick={printCard}>
                {td("printCard")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="text-base font-bold text-slate-800">{t("gradingSystem")}</h2>
              {!result.grading_legend.length ? (
                <p className="text-sm text-slate-400">{t("noGradingScale")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="p-1.5 font-semibold">{t("marksPercent")}</th>
                        <th className="p-1.5 font-semibold">{td("grade")}</th>
                        <th className="p-1.5 font-semibold">{t("gradePoint")}</th>
                        <th className="p-1.5 font-semibold">{t("remarks")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.grading_legend.map((g, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="p-1.5 text-slate-600">{g.range}</td>
                          <td className="p-1.5 font-medium text-slate-800">{g.grade_letter}</td>
                          <td className="p-1.5 text-slate-600">{g.grade_point.toFixed(2)}</td>
                          <td className="p-1.5 text-slate-500">{g.remarks ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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
