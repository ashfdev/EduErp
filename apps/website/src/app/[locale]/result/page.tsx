"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search, Printer, GraduationCap, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

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
  
  const printRef = useRef<HTMLDivElement>(null);

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
  
  const handlePrint = () => {
    window.print();
  };

  const getGradeColor = (grade: string | null) => {
    if (!grade) return "bg-slate-100 text-slate-700";
    if (grade.includes("F")) return "bg-red-100 text-red-700";
    if (grade.includes("A") || grade === "A+") return "bg-green-100 text-green-800";
    if (grade.includes("B")) return "bg-blue-100 text-blue-800";
    return "bg-slate-100 text-slate-700";
  };

  const inputCls = "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm transition-all focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-600/10 outline-none";
  const labelCls = "mb-1.5 block text-xs font-bold text-slate-700 uppercase tracking-wider";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pt-8 pb-16 px-4 flex flex-col items-center">
      
      {/* Header */}
      <div className="text-center mb-6 print:hidden">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
          <Search className="h-5 w-5 text-green-700" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1.5">{t("title")}</h1>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">{t("subtitle")}</p>
      </div>

      {/* Search Form Card */}
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 print:hidden mb-6">
        
        {/* Toggle Mode */}
        <div className="flex bg-slate-100/80 p-1.5 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => setMode("uid")}
            className={`flex-1 flex justify-center items-center py-2 px-4 text-sm font-bold rounded-xl transition-all ${mode === "uid" ? "bg-white text-green-700 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("studentId")}
          </button>
          <button
            type="button"
            onClick={() => setMode("roll")}
            className={`flex-1 flex justify-center items-center py-2 px-4 text-sm font-bold rounded-xl transition-all ${mode === "roll" ? "bg-white text-green-700 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("rollRegistration")}
          </button>
        </div>

        <form onSubmit={search} className="space-y-4">
          {mode === "uid" ? (
            <div>
              <label className={labelCls}>Student ID</label>
              <input required placeholder={t("studentIdPlaceholder")} value={studentUid} onChange={(e) => setStudentUid(e.target.value)} className={inputCls} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Roll Number</label>
                <input required placeholder={t("rollPlaceholder")} value={rollNo} onChange={(e) => setRollNo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Registration Number</label>
                <input required placeholder={t("registrationPlaceholder")} value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {showExamFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className={labelCls}>Select Exam</label>
                <select value={examTypeId} onChange={(e) => setExamTypeId(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
                  <option value="">{t("anyExam")}</option>
                  {examTypes.map((et) => <option key={et.id} value={et.id}>{et.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Select Year</label>
                <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
                  <option value="">{t("anyYear")}</option>
                  {academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? t("currentSuffix") : ""}</option>)}
                </select>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3.5 text-sm font-bold text-white hover:bg-green-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-green-200">
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("searching")}</>
            ) : (
              <><Search className="h-4 w-4" /> {t("findResult")}</>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {result && !result.found && (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <Search className="h-8 w-8 text-slate-400 mb-3" />
            <h3 className="text-base font-bold text-slate-900 mb-1">No Result Found</h3>
            <p className="text-sm text-slate-500">{t("notFound")}</p>
          </div>
        )}
      </div>

      {/* Result Display Area */}
      {result?.found && !loading && (
        <div ref={printRef} className="w-full max-w-4xl rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden print:shadow-none print:ring-0">
          
          {/* Result Header */}
          <div className="bg-slate-900 px-6 py-8 sm:px-10 sm:py-10 text-white relative overflow-hidden">
            <div className="absolute -top-10 -right-10 p-8 opacity-5">
              <GraduationCap className="h-64 w-64" />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-green-400 font-bold text-sm tracking-wider uppercase mb-1">Academic Result</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">{result.student_name}</h2>
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  Student ID: {result.student_uid}
                </div>
              </div>
              <button onClick={handlePrint} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold transition-colors print:hidden backdrop-blur-sm border border-white/10">
                <Printer className="h-4 w-4" /> Print Copy
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-10 space-y-10 bg-slate-50/30">
            {!result.results?.length && (
              <div className="text-center py-10">
                <p className="text-slate-500">{t("noResultFound")}</p>
              </div>
            )}

            {result.results?.map((r, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Exam Header */}
                <div className="bg-white border-b border-slate-100 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="font-bold text-lg text-slate-900">{r.exam_name}</h3>
                  <div className={`self-start sm:self-auto px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border ${r.has_failed ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                    {r.has_failed ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {r.has_failed ? t("failed") : 'SUCCESSFULLY PASSED'}
                  </div>
                </div>

                {/* Marks Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Subject</th>
                        <th className="px-6 py-4 text-center">Marks Obtained</th>
                        <th className="px-6 py-4 text-center">Grade Letter</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {r.subjects.map((s, si) => (
                        <tr key={si} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-700">{s.subject_name}</td>
                          <td className="px-6 py-4 text-center">
                            {s.is_absent ? (
                              <span className="text-red-600 font-bold text-xs uppercase bg-red-50 px-2.5 py-1 rounded-md border border-red-100">{t("absent")}</span>
                            ) : (
                              <span className="font-bold text-slate-900 text-base">{s.marks_total}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-sm font-bold border ${getGradeColor(s.grade_letter)} ${s.grade_letter ? 'border-current/20' : 'border-transparent'}`}>
                              {s.grade_letter || "-"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Footer */}
                <div className="bg-slate-50/80 border-t border-slate-200 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-sm text-slate-500 font-bold uppercase tracking-wider">Overall Summary</div>
                  <div className="flex items-center gap-8 bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-100">
                    <div className="text-center">
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">GPA</div>
                      <div className="font-extrabold text-2xl text-slate-900 leading-none">{r.has_failed ? '0.00' : r.gpa.toFixed(2)}</div>
                    </div>
                    <div className="w-px h-10 bg-slate-200" />
                    <div className="text-center">
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">Grade</div>
                      <div className={`font-extrabold text-2xl leading-none ${r.has_failed ? 'text-red-600' : 'text-green-600'}`}>{r.grade || 'F'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
