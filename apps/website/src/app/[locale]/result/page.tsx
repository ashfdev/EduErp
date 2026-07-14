"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface LookupResult {
  found: boolean;
  student_name?: string;
  student_uid?: string;
  results?: {
    exam_name: string;
    subjects: { subject_name: string; marks_total: number | null; grade_letter: string | null; is_absent: boolean }[];
    gpa: number;
    grade: string;
    has_failed: boolean;
  }[];
}
interface InstitutionInfo {
  type: "SCHOOL" | "COLLEGE" | "UNIVERSITY" | "MADRASAH";
  has_semesters: boolean;
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

export default function ResultLookupPage() {
  const t = useTranslations("result");
  const [mode, setMode] = useState<"uid" | "roll">("uid");
  const [studentUid, setStudentUid] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [institution, setInstitution] = useState<InstitutionInfo | null>(null);
  const [examTypes, setExamTypes] = useState<ExamTypeOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);

  // University students search by ID alone — the exam-type/session concept
  // that school/college/madrasah results are organized by (Half Yearly,
  // Test, etc.) doesn't map onto semester-based grading the same way.
  const showExamFilters = institution ? !institution.has_semesters : false;

  useEffect(() => {
    fetch(`${API_URL}/api/content/institution`).then((r) => r.json()).then((body) => setInstitution(body.data ?? null)).catch(() => setInstitution(null));
    fetch(`${API_URL}/api/content/exam-types`).then((r) => r.json()).then((body) => setExamTypes(body.data ?? [])).catch(() => setExamTypes([]));
    fetch(`${API_URL}/api/content/academic-years`).then((r) => r.json()).then((body) => setAcademicYears(body.data ?? [])).catch(() => setAcademicYears([]));
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const params = new URLSearchParams(mode === "uid" ? { student_uid: studentUid } : { roll_no: rollNo, registration_no: registrationNo });
    if (showExamFilters && examTypeId) params.set("exam_type_config_id", examTypeId);
    if (showExamFilters && academicYearId) params.set("academic_year_id", academicYearId);

    try {
      const res = await fetch(`${API_URL}/api/results/public/lookup?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? t("lookupFailed"));
        return;
      }
      setResult(body.data);
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-600">{t("subtitle")}</p>

      <div className="mb-1 flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "uid"} onChange={() => setMode("uid")} /> {t("studentId")} <span className="text-xs font-medium text-green-700">{t("recommended")}</span>
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "roll"} onChange={() => setMode("roll")} /> {t("rollRegistration")}
        </label>
      </div>
      {mode === "roll" && (
        <p className="mb-3 text-xs text-amber-700">
          {t("rollModeHint")}
        </p>
      )}
      {mode === "uid" && <div className="mb-3" />}

      <form onSubmit={search} className="space-y-3">
        {mode === "uid" ? (
          <input required placeholder={t("studentIdPlaceholder")} value={studentUid} onChange={(e) => setStudentUid(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        ) : (
          <>
            <input required placeholder={t("rollPlaceholder")} value={rollNo} onChange={(e) => setRollNo(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
            <input required placeholder={t("registrationPlaceholder")} value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          </>
        )}

        {showExamFilters && (
          <div className="grid grid-cols-2 gap-3">
            <select value={examTypeId} onChange={(e) => setExamTypeId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="">{t("anyExam")}</option>
              {examTypes.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}
            </select>
            <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="">{t("anyYear")}</option>
              {academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? t("currentSuffix") : ""}</option>)}
            </select>
          </div>
        )}

        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? t("searching") : t("findResult")}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && !result.found && <p className="mt-4 text-sm text-gray-600">{t("notFound")}</p>}

      {result?.found && (
        <div className="mt-6 space-y-4">
          <p className="font-medium">{result.student_name} <span className="font-mono text-sm text-gray-500">({result.student_uid})</span></p>
          {!result.results?.length && <p className="text-sm text-gray-600">{t("noResultFound")}</p>}
          {result.results?.map((r, i) => (
            <div key={i} className="rounded-md border p-4">
              <p className="mb-2 font-medium">{r.exam_name}</p>
              <table className="w-full text-sm">
                <tbody>
                  {r.subjects.map((s, si) => (
                    <tr key={si} className="border-b">
                      <td className="py-1">{s.subject_name}</td>
                      <td className="py-1">{s.is_absent ? t("absent") : s.marks_total}</td>
                      <td className="py-1">{s.grade_letter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-sm">
                {t("overall", { result: r.has_failed ? t("failed") : `GPA ${r.gpa} (${r.grade})` })}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
