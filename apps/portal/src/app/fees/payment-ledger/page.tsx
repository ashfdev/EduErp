"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { FinancialSubNav } from "@/components/financial-sub-nav";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState, EmptyState } from "@education-erp/ui";
import { BookOpenText, Wallet, CheckCircle2, AlertTriangle } from "lucide-react";

interface LedgerEntry {
  id: string;
  date: string;
  collected_by: string;
  category: string;
  description: string;
  period: string;
  receivable: number;
  paid: number;
  receipt_no: string | null;
}
interface LedgerResponse {
  summary: { total_payable: number; total_paid: number; total_due: number };
  entries: LedgerEntry[];
}
interface AcademicYearOption {
  id: string;
  label: string;
  is_active: boolean;
}

function PaymentLedgerContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("paymentLedger");
  const tCommon = useTranslations("common");
  const tResults = useTranslations("results");
  const [academicYearId, setAcademicYearId] = useState("");

  const { data: academicYears } = useQuery<AcademicYearOption[]>({
    queryKey: ["content", "academic-years"],
    queryFn: async () => (await api.get("/api/content/academic-years")).data.data,
  });

  const { data, isLoading, isError, refetch } = useQuery<LedgerResponse>({
    queryKey: ["portal", "payment-ledger", activeStudentId, academicYearId],
    queryFn: async () =>
      (
        await api.get(`/api/portal/student/${activeStudentId}/payment-ledger`, {
          params: { academic_year_id: academicYearId || undefined },
        })
      ).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  return (
    <div className="space-y-6 lg:space-y-8">
      <FinancialSubNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-600">
            <BookOpenText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-500">{t("subtitle")}</p>
          </div>
        </div>
        <select
          value={academicYearId}
          onChange={(e) => setAcademicYearId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        >
          <option value="">{t("allSessions")}</option>
          {academicYears?.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
              {y.is_active ? tResults("currentSuffix") : ""}
            </option>
          ))}
        </select>
      </div>

      {isError ? (
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-0 bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-md">
              <CardContent className="p-5 relative overflow-hidden">
                <Wallet className="absolute -right-3 -bottom-3 h-20 w-20 opacity-10" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">{t("totalPayable")}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">৳{data?.summary.total_payable.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-200">
              <CardContent className="p-5 relative overflow-hidden">
                <CheckCircle2 className="absolute -right-3 -bottom-3 h-20 w-20 opacity-10" />
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">{t("totalPaid")}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">৳{data?.summary.total_paid.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card className={`border-0 text-white shadow-md ${(data?.summary.total_due ?? 0) > 0 ? "bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-200" : "bg-gradient-to-br from-slate-400 to-slate-500"}`}>
              <CardContent className="p-5 relative overflow-hidden">
                <AlertTriangle className="absolute -right-3 -bottom-3 h-20 w-20 opacity-10" />
                <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{t("totalDue")}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">৳{Math.max(0, data?.summary.total_due ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              {!data?.entries.length ? (
                <div className="p-8"><EmptyState title={t("noEntries")} /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <th className="px-4 py-3">{t("sl")}</th>
                        <th className="px-4 py-3">{t("date")}</th>
                        <th className="px-4 py-3">{t("collectedBy")}</th>
                        <th className="px-4 py-3">{t("headDescription")}</th>
                        <th className="px-4 py-3 text-right">{t("receivable")}</th>
                        <th className="px-4 py-3 text-right">{t("paid")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((e, i) => (
                        <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">{new Date(e.date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-slate-600">{e.collected_by}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{e.description}</p>
                            <p className="text-xs text-slate-400">{e.period}{e.receipt_no ? ` · ${e.receipt_no}` : ""}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700 tabular-nums">৳{e.receivable.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">৳{e.paid.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function PaymentLedgerPage() {
  return (
    <PortalShell>
      <PaymentLedgerContent />
    </PortalShell>
  );
}
