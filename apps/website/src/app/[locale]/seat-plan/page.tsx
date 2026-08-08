"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Armchair, AlertCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SeatPlanEntry {
  exam_name: string;
  session_label: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  hall_name: string | null;
  room_number: string | null;
  floor: string | null;
  row_number: number | null;
  seat_in_row: number | null;
}
interface LookupResult {
  found: boolean;
  student_name?: string;
  student_uid?: string;
  seat_plans?: SeatPlanEntry[];
}

export default function SeatPlanLookupPage() {
  const t = useTranslations("seatPlanLookup");
  const [mode, setMode] = useState<"uid" | "roll">("uid");
  const [studentUid, setStudentUid] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const params = new URLSearchParams(
      mode === "uid" ? { student_uid: studentUid, registration_no: registrationNo } : { roll_no: rollNo, registration_no: registrationNo },
    );

    try {
      const res = await fetch(`${API_URL}/api/results/public/seat-plan?${params.toString()}`);
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

  const inputCls = "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm transition-all focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-600/10 outline-none";
  const labelCls = "mb-1.5 block text-xs font-bold text-slate-700 uppercase tracking-wider";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pt-8 pb-16 px-4 flex flex-col items-center">
      <div className="text-center mb-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
          <Armchair className="h-5 w-5 text-green-700" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1.5">{t("title")}</h1>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">{t("subtitle")}</p>
      </div>

      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-6">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t("studentId")}</label>
                <input required placeholder={t("studentIdPlaceholder")} value={studentUid} onChange={(e) => setStudentUid(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t("registrationNumber")}</label>
                <input required placeholder={t("registrationPlaceholder")} value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} className={inputCls} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t("rollNumber")}</label>
                <input required placeholder={t("rollPlaceholder")} value={rollNo} onChange={(e) => setRollNo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t("registrationNumber")}</label>
                <input required placeholder={t("registrationPlaceholder")} value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3.5 text-sm font-bold text-white hover:bg-green-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-green-200">
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("searching")}</>
            ) : (
              <><Search className="h-4 w-4" /> {t("findSeat")}</>
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
            <h3 className="text-base font-bold text-slate-900 mb-1">{t("notFoundTitle")}</h3>
            <p className="text-sm text-slate-500">{t("notFound")}</p>
          </div>
        )}
      </div>

      {result?.found && !loading && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="rounded-2xl bg-slate-900 px-6 py-5 text-white">
            <h2 className="text-xl font-extrabold">{result.student_name}</h2>
            <p className="text-slate-300 text-sm">{t("studentId")}: {result.student_uid}</p>
          </div>

          {!result.seat_plans?.length && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              {t("noSeatPlans")}
            </div>
          )}

          {result.seat_plans?.map((s, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="font-bold text-slate-900">{s.exam_name}</h3>
                {s.session_label && (
                  <p className="text-xs text-slate-500 mt-1">
                    {s.session_label}{s.session_date && ` — ${new Date(s.session_date).toLocaleDateString()}`}{s.start_time && ` · ${s.start_time}–${s.end_time}`}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-5 bg-slate-50/60">
                <div>
                  <p className="text-[11px] uppercase text-slate-400 font-bold tracking-wider">{t("hall")}</p>
                  <p className="font-bold text-slate-900">{s.hall_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-slate-400 font-bold tracking-wider">{t("room")}</p>
                  <p className="font-bold text-slate-900">{s.room_number ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-slate-400 font-bold tracking-wider">{t("floor")}</p>
                  <p className="font-bold text-slate-900">{s.floor ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-slate-400 font-bold tracking-wider">{t("rowSeat")}</p>
                  <p className="font-bold text-slate-900">{s.row_number ? `${t("row")} ${s.row_number}, ${t("seat")} ${s.seat_in_row}` : "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
