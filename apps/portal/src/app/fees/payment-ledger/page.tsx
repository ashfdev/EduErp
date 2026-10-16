"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { FinancialSubNav } from "@/components/financial-sub-nav";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState, EmptyState } from "@education-erp/ui";
import { BookOpenText } from "lucide-react";

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
          <div className="rounded-lg bg-forest/10 p-2.5 text-forest">
            <BookOpenText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <select
          value={academicYearId}
          onChange={(e) => setAcademicYearId(e.target.value)}
          className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
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
            <Card className="border-0 bg-forest text-white">
              <CardContent className="p-5">
                <p className="text-sm font-semibold text-white/75">{t("totalPayable")}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">৳{data?.summary.total_payable.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-lime text-forest">
              <CardContent className="p-5">
                <p className="text-sm font-semibold text-forest/75">{t("totalPaid")}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">৳{data?.summary.total_paid.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card className={(data?.summary.total_due ?? 0) > 0 ? "border-0 bg-ember text-white" : "text-forest"}>
              <CardContent className="p-5">
                <p className={`text-sm font-semibold ${(data?.summary.total_due ?? 0) > 0 ? "text-white/85" : "text-muted-foreground"}`}>{t("totalDue")}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">৳{Math.max(0, data?.summary.total_due ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border">
            <CardContent className="p-0">
              {!data?.entries.length ? (
                <div className="p-8"><EmptyState title={t("noEntries")} /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
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
                        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{new Date(e.date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">{e.collected_by}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{e.description}</p>
                            <p className="text-xs text-muted-foreground">{e.period}{e.receipt_no ? ` · ${e.receipt_no}` : ""}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">৳{e.receivable.toLocaleString()}</td>
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
