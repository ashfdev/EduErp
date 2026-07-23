"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Phone, FileText, CheckCircle2, AlertCircle, Calendar, MapPin, Download } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface StatusResult {
  found: boolean;
  admission_roll?: string;
  applicant_name?: string;
  cycle_name?: string;
  status?: string;
  merit_rank?: number | null;
  requires_test?: boolean;
  test_date?: string | null;
  test_venue?: string | null;
  admit_card_available?: boolean;
}

const inputCls = "w-full rounded-2xl border-2 border-slate-100 bg-slate-50 pl-11 pr-4 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:outline-none transition-all";
const labelCls = "block text-sm font-semibold text-slate-700 mb-2";

export default function AdmissionStatusPage() {
  const t = useTranslations("admissionStatus");
  const [admissionRoll, setAdmissionRoll] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ admission_roll: admissionRoll, phone });
      const res = await fetch(`${API_URL}/api/admission/application/status?${params.toString()}`);
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
    <main className="min-h-[calc(100vh-80px)] bg-[#f0fdf4] pt-12 pb-24 px-4 flex justify-center">
      <div className="w-full max-w-lg">
        
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-green-100">
            <Search className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">{t("title")}</h1>
          <p className="text-slate-500 text-sm max-w-xs mx-auto">{t("subtitle")}</p>
        </div>

        <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-6 sm:p-8">
          <form onSubmit={check} className="space-y-5">
            <div>
              <label className={labelCls}>Admission Roll Number</label>
              <div className="relative">
                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-700" />
                <input required placeholder={t("rollPlaceholder")} value={admissionRoll} onChange={(e) => setAdmissionRoll(e.target.value)} className={inputCls} />
              </div>
            </div>
            
            <div>
              <label className={labelCls}>Guardian Phone</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-700" />
                <input required placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-4 text-sm font-bold text-white hover:bg-green-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-green-200">
              {loading ? (
                <><div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Checking...</>
              ) : (
                <><Search className="h-5 w-5" /> {t("checkStatus")}</>
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
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl bg-slate-50 p-6 text-center border border-slate-100">
              <AlertCircle className="h-8 w-8 text-slate-400 mb-2" />
              <h3 className="font-bold text-slate-700 mb-1">Not Found</h3>
              <p className="text-sm text-slate-500">{t("notFound")}</p>
            </div>
          )}

          {result?.found && (
            <div className="mt-8 rounded-2xl bg-[#f0fdf4] border border-green-100 overflow-hidden">
              <div className="p-5 border-b border-green-100 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg mb-1">{result.applicant_name}</h3>
                  <p className="text-sm font-medium text-green-700">{result.cycle_name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">Roll: {result.admission_roll}</p>
                </div>
                <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-primary ring-1 ring-green-200">
                  {t("status", { status: result.status ?? "" })}
                </div>
              </div>

              {result.merit_rank && (
                <div className="bg-white p-4 flex items-center justify-between border-b border-green-100">
                  <span className="text-sm font-semibold text-slate-600">Merit Position</span>
                  <span className="text-lg font-black text-slate-900">#{result.merit_rank}</span>
                </div>
              )}

              {result.requires_test && (
                <div className="bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> {t("admissionTest")}
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {result.test_date && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Date & Time</p>
                          <p className="text-sm font-semibold text-slate-800 mt-0.5">{t("date", { date: new Date(result.test_date).toLocaleString() })}</p>
                        </div>
                      </div>
                    )}
                    {result.test_venue && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Venue</p>
                          <p className="text-sm font-semibold text-slate-800 mt-0.5">{t("venue", { venue: result.test_venue })}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    {result.admit_card_available ? (
                      <a
                        href={`${API_URL}/api/admission/application/admit-card?admission_roll=${encodeURIComponent(admissionRoll)}&phone=${encodeURIComponent(phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 transition shadow-sm"
                      >
                        <Download className="h-4 w-4" /> {t("downloadAdmitCard")}
                      </a>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-3 text-center">
                        <p className="text-xs font-medium text-slate-500">{t("admitCardPending")}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
