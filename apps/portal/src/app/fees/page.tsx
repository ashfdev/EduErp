"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, Input, StatusBadge, LoadingSpinner, ErrorState, PdfPreviewModal } from "@education-erp/ui";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface Invoice {
  id: string;
  description: string;
  category: string;
  month?: number | null;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  due_date: string;
  status: string;
  fee_structure?: { frequency: string } | null;
  payments: { id: string; amount: number; gateway: string; status: string; paid_at: string | null }[];
}

interface FeesResponse {
  invoices: Invoice[];
  credit_balance: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  ADMISSION: "Admission", FORM: "Form", READMISSION: "Readmission", TUITION: "Tuition", EXAM: "Exam",
  TRANSPORT: "Transport", HOSTEL: "Hostel", LAB: "Lab", LIBRARY: "Library", SPORTS: "Sports",
  DEVELOPMENT: "Development", OTHER: "Other",
};

function frequencyLabel(inv: Invoice): string {
  const freq = inv.fee_structure?.frequency ?? (inv.month ? "MONTHLY" : "ONE_TIME");
  if (freq === "MONTHLY") return "Monthly";
  if (freq === "YEARLY") return "Yearly";
  return "One-time";
}

interface UpcomingDue {
  category: string;
  name: string;
  amount: number;
  frequency: string;
  due_date: string | null;
}

const GATEWAYS = [
  { key: "BKASH", label: "bKash" },
  { key: "NAGAD", label: "Nagad" },
  { key: "ROCKET", label: "Rocket" },
  { key: "SSLCOMMERZ", label: "SSLCommerz" },
  { key: "BANK_TRANSFER", label: "Bank Transfer" },
];

import { Receipt, Wallet, Banknote, CalendarClock, History, UploadCloud, CheckCircle2 } from "lucide-react";

// (Skipping boilerplate above FeesContent - we'll just rewrite FeesContent)
function FeesContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("fees");
  const tCommon = useTranslations("common");
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const pdfPreview = usePdfPreview();
  const [showHistory, setShowHistory] = useState(false);
  const [pendingSlipPaymentId, setPendingSlipPaymentId] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);

  const { data: feesData, isLoading, isError, refetch } = useQuery<FeesResponse>({
    queryKey: ["portal", "fees", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/fees`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });
  const data = feesData?.invoices;
  const { data: upcoming } = useQuery<UpcomingDue[]>({
    queryKey: ["portal", "upcoming-dues", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/upcoming-dues`)).data.data,
    enabled: !!activeStudentId,
  });

  const payMutation = useMutation({
    mutationFn: ({ invoiceId, gateway }: { invoiceId: string; gateway: string }) => api.post("/api/portal/fees/pay", { invoice_id: invoiceId, gateway }),
    onSuccess: (res) => {
      if (res.data.data.payment_url) {
        window.location.href = res.data.data.payment_url;
        return;
      }
      setPendingSlipPaymentId(res.data.data.payment_id);
      setPayingInvoice(null);
      refetch();
    },
    onError: () => {
      toast.error(t("gatewayError"));
      setPayingInvoice(null);
    },
  });

  const slipMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("slip", slipFile!);
      return api.post(`/api/portal/fees/payments/${pendingSlipPaymentId}/slip`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success(t("slipUploaded"));
      setPendingSlipPaymentId(null);
      setSlipFile(null);
      refetch();
    },
    onError: () => toast.error(t("slipUploadFailed")),
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  const unpaid = data?.filter((i) => i.status !== "PAID" && i.status !== "WAIVED") ?? [];
  const totalOutstanding = unpaid.reduce((sum, i) => sum + (i.amount_due + i.fine_amount - i.amount_paid), 0);
  const allPayments = (data ?? []).flatMap((i) => i.payments.map((p) => ({ ...p, description: i.description })));

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600">
          <Banknote className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {totalOutstanding > 0 && (
          <Card className="border-0 bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-md shadow-rose-200">
            <CardContent className="p-6 relative overflow-hidden">
              <Wallet className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10" />
              <p className="text-sm font-medium text-rose-100 uppercase tracking-wider">{t("totalOutstanding")}</p>
              <p className="text-4xl font-bold mt-2 tracking-tight">৳{totalOutstanding}</p>
            </CardContent>
          </Card>
        )}

        {!!feesData?.credit_balance && feesData.credit_balance > 0 && (
          <Card className="border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-200">
            <CardContent className="p-6 relative overflow-hidden">
              <CheckCircle2 className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10" />
              <p className="text-sm font-medium text-emerald-100 uppercase tracking-wider">{t("creditBalance")}</p>
              <p className="text-4xl font-bold mt-2 tracking-tight">৳{feesData.credit_balance}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {pendingSlipPaymentId && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3">
              <UploadCloud className="h-6 w-6 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">{t("uploadSlip")}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input type="file" className="bg-white" onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)} />
              <Button onClick={() => slipMutation.mutate()} disabled={!slipFile || slipMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
                {slipMutation.isPending ? <LoadingSpinner className="h-4 w-4 mr-2" /> : null}
                {t("uploadSlipButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Unpaid Invoices */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Receipt className="h-5 w-5 text-slate-400" /> Current Invoices
          </h2>
          {!unpaid.length && (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-sm font-medium text-slate-500">{t("noOutstanding")}</p>
            </div>
          )}
          {unpaid.map((inv) => (
            <Card key={inv.id} className="border-slate-200 shadow-sm transition-all hover:shadow-md">
              <CardContent className="p-5 flex flex-col sm:flex-row gap-5 items-start justify-between">
                <div className="space-y-1 w-full">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={inv.status} />
                    <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">{CATEGORY_LABEL[inv.category] ?? inv.category}</span>
                  </div>
                  <p className="font-bold text-slate-800 text-lg leading-tight mt-1">{inv.description}</p>
                  <div className="flex items-center gap-3 text-sm text-slate-500 mt-2">
                    <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> {t("due", { date: new Date(inv.due_date).toLocaleDateString() })}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => pdfPreview.openPreview(`/api/portal/fees/invoices/${inv.id}/pdf`, inv.description)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t("viewInvoice")}
                  </button>
                </div>
                
                <div className="flex flex-col items-end shrink-0 w-full sm:w-auto">
                  <div className="text-right mb-3">
                    <p className="text-2xl font-bold tracking-tight text-slate-900">৳{inv.amount_due}</p>
                    {inv.fine_amount > 0 && <p className="text-xs font-medium text-rose-500 mt-0.5">{t("fine", { amount: inv.fine_amount })}</p>}
                  </div>
                  
                  {payingInvoice === inv.id ? (
                    <div className="flex flex-wrap sm:flex-col gap-2 w-full">
                      {GATEWAYS.map((g) => (
                        <Button key={g.key} size="sm" variant="outline" className="w-full justify-start text-xs font-semibold" disabled={payMutation.isPending} onClick={() => payMutation.mutate({ invoiceId: inv.id, gateway: g.key })}>
                          {g.label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button className="w-full sm:w-auto" onClick={() => setPayingInvoice(inv.id)}>{t("payNow")}</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Upcoming & History */}
        <div className="space-y-6">
          {!!upcoming?.length && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <CalendarClock className="h-5 w-5 text-slate-400" /> {t("upcomingProjected")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {upcoming.map((u, i) => (
                  <div key={i} className="flex flex-col rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-700">{u.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {u.due_date ? `Last date: ${new Date(u.due_date).toLocaleDateString()}` : "Last date not set yet"}
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{u.frequency}</p>
                      <p className="font-bold text-slate-600">৳{u.amount}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <History className="h-5 w-5 text-slate-400" /> Payment History
              </h2>
              <button onClick={() => setShowHistory((s) => !s)} className="text-xs font-bold text-primary hover:underline">
                {showHistory ? t("hideHistory") : t("showHistory")}
              </button>
            </div>
            
            {showHistory && (
              <div className="space-y-3">
                {!allPayments.length && (
                  <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-dashed text-center">{t("noPayments")}</p>
                )}
                {allPayments.map((p) => (
                  <Card key={p.id} className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{p.description}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">{p.gateway} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "-"}</p>
                        <button
                          type="button"
                          onClick={() => pdfPreview.openPreview(`/api/portal/fees/receipts/${p.id}`, p.description)}
                          className="text-xs font-semibold text-primary hover:underline mt-1"
                        >
                          {t("viewReceipt")}
                        </button>
                      </div>
                      <p className="font-bold text-emerald-600">৳{p.amount}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <PdfPreviewModal
        open={pdfPreview.open}
        onOpenChange={(open) => !open && pdfPreview.closePreview()}
        title={pdfPreview.title}
        pdfUrl={pdfPreview.url}
      />
    </div>
  );
}

export default function FeesPage() {
  return (
    <PortalShell>
      <FeesContent />
    </PortalShell>
  );
}
