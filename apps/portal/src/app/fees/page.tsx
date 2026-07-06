"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, Input, StatusBadge, LoadingSpinner } from "@education-erp/ui";

interface Invoice {
  id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  due_date: string;
  status: string;
  payments: { id: string; amount: number; gateway: string; status: string; paid_at: string | null }[];
}

interface UpcomingDue {
  category: string;
  name: string;
  amount: number;
  frequency: string;
}

const GATEWAYS = [
  { key: "BKASH", label: "bKash" },
  { key: "NAGAD", label: "Nagad" },
  { key: "ROCKET", label: "Rocket" },
  { key: "SSLCOMMERZ", label: "SSLCommerz" },
  { key: "BANK_TRANSFER", label: "Bank Transfer" },
];

function FeesContent() {
  const { activeStudentId } = useAuthStore();
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingSlipPaymentId, setPendingSlipPaymentId] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ["portal", "fees", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/fees`)).data.data,
    enabled: !!activeStudentId,
  });
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
      // Bank transfer: no redirect — collect the slip next instead.
      setPendingSlipPaymentId(res.data.data.payment_id);
      setPayingInvoice(null);
      refetch();
    },
    onError: () => {
      toast.error("Payment gateway not configured yet — merchant credentials pending");
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
      toast.success("Slip uploaded — staff will verify it against the bank statement");
      setPendingSlipPaymentId(null);
      setSlipFile(null);
      refetch();
    },
    onError: () => toast.error("Failed to upload slip"),
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  const unpaid = data?.filter((i) => i.status !== "PAID" && i.status !== "WAIVED") ?? [];
  const totalOutstanding = unpaid.reduce((sum, i) => sum + (i.amount_due + i.fine_amount - i.amount_paid), 0);
  const allPayments = (data ?? []).flatMap((i) => i.payments.map((p) => ({ ...p, description: i.description })));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Fees</h1>

      {totalOutstanding > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-700">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-700">৳{totalOutstanding}</p>
          </CardContent>
        </Card>
      )}

      {pendingSlipPaymentId && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium text-amber-800">Upload your bank transfer slip</p>
            <Input type="file" onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)} />
            <Button size="sm" onClick={() => slipMutation.mutate()} disabled={!slipFile || slipMutation.isPending}>
              {slipMutation.isPending ? "Uploading..." : "Upload Slip"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!unpaid.length && <p className="text-sm text-gray-500">No outstanding invoices.</p>}
      {unpaid.map((inv) => (
        <Card key={inv.id}>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">{inv.description}</p>
              <StatusBadge status={inv.status} />
            </div>
            <p className="text-sm text-gray-500">Due {new Date(inv.due_date).toLocaleDateString()}</p>
            <p className="text-sm">৳{inv.amount_due} {inv.fine_amount > 0 && <span className="text-red-600">+ ৳{inv.fine_amount} fine</span>}</p>
            {payingInvoice === inv.id ? (
              <div className="flex flex-wrap gap-2">
                {GATEWAYS.map((g) => (
                  <Button key={g.key} size="sm" variant="outline" disabled={payMutation.isPending} onClick={() => payMutation.mutate({ invoiceId: inv.id, gateway: g.key })}>
                    {g.label}
                  </Button>
                ))}
              </div>
            ) : (
              <Button size="sm" onClick={() => setPayingInvoice(inv.id)}>Pay Now</Button>
            )}
          </CardContent>
        </Card>
      ))}

      {!!upcoming?.length && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Upcoming (Projected)</p>
          <div className="space-y-2">
            {upcoming.map((u, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm text-gray-600">
                <div>
                  <p>{u.name}</p>
                  <p className="text-xs text-gray-400">{u.frequency} · not yet invoiced</p>
                </div>
                <p className="font-medium">৳{u.amount}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowHistory((s) => !s)} className="text-sm font-medium text-[var(--primary,#1a3c4a)]">
        {showHistory ? "Hide" : "Show"} Payment History
      </button>
      {showHistory && (
        <div className="space-y-2">
          {!allPayments.length && <p className="text-sm text-gray-500">No payments yet.</p>}
          {allPayments.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between pt-6 text-sm">
                <div>
                  <p>{p.description}</p>
                  <p className="text-xs text-gray-500">{p.gateway} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "-"}</p>
                </div>
                <p className="font-medium">৳{p.amount}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
