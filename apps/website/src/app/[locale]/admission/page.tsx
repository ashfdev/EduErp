"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { GraduationCap, Calendar, Users, Wallet, ArrowRight, Activity, Clock } from "lucide-react";
import { ErrorState } from "@education-erp/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Cycle {
  id: string;
  name: string;
  class: { name_en: string; name_bn?: string };
  open_date: string;
  close_date: string;
  seat_count: number;
  app_fee: number;
  is_open: boolean;
}

export default function AdmissionListPage() {
  const t = useTranslations("admission");
  const tCommon = useTranslations("common");
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/admission/public/cycles`)
      .then((r) => r.json())
      .then((body) => setCycles(body.data ?? []))
      .catch(() => {
        setError(true);
        setCycles(null);
      });
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        
        {/* Header section */}
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-5 ring-4 ring-primary/5">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-4">{t("title")}</h1>
          <p className="text-slate-500 text-base">{t("subtitle")}</p>
        </div>

        {cycles === null && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary mb-4" />
            <p className="text-slate-500 font-medium">{t("loading")}</p>
          </div>
        )}

        {cycles?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 text-center ring-1 ring-slate-100 shadow-sm mt-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4">
              <Clock className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Open Admissions</h3>
            <p className="text-slate-500 text-sm">{t("noCycles")}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cycles?.map((c) => (
            <div key={c.id} className="group flex flex-col rounded-3xl bg-white p-6 sm:p-8 ring-1 ring-slate-100 shadow-sm transition-all hover:shadow-md hover:ring-primary/20 relative overflow-hidden">
              
              {/* Top Banner decoration */}
              <div className={`absolute top-0 left-0 w-full h-1.5 ${c.is_open ? 'bg-primary' : 'bg-slate-300'}`} />

              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors mb-1">{c.name}</h3>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {c.class.name_en}
                  </span>
                </div>
                <div className={`shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  c.is_open 
                    ? "bg-green-50 text-green-700 border-green-200 shadow-sm shadow-green-100" 
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  {c.is_open ? (
                    <><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />{t("open")}</>
                  ) : (
                    <>{t("closed")}</>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-sm">
                <div className="flex items-start gap-2.5 text-slate-600">
                  <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Timeline</p>
                    <p className="font-medium text-slate-700">
                      {new Date(c.open_date).toLocaleDateString()} - <br/>{new Date(c.close_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-700">{c.seat_count} Seats</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Wallet className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-700">৳{c.app_fee} Fee</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex flex-col sm:flex-row items-center gap-3 pt-5 border-t border-slate-100">
                {c.is_open ? (
                  <Link 
                    href={`/admission/${c.id}`} 
                    className="w-full sm:w-1/2 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]"
                  >
                    {t("applyNow")} <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <div className="w-full sm:w-1/2 flex items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-400 cursor-not-allowed">
                    {t("closed")}
                  </div>
                )}
                <Link 
                  href="/admission/status" 
                  className="w-full sm:w-1/2 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:text-primary active:scale-[0.98]"
                >
                  <Activity className="h-4 w-4 text-slate-400" /> {t("checkStatus")}
                </Link>
              </div>

            </div>
          ))}
        </div>
        
      </main>
    </div>
  );
}
