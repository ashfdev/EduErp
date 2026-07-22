"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, EmptyState, PdfPreviewModal, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface Invoice {
  id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  status: string;
  due_date: string;
  student: { name_en: string; student_uid: string; current_class?: { name_en: string } | null };
}

function canWaive(status: string) {
  return status !== "PAID" && status !== "WAIVED";
}
interface YearOption { id: string; is_active: boolean }

async function downloadInvoicePdf(invoiceId: string) {
  const res = await api.get(`/api/documents/fee/invoice/${invoiceId}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Invoice_${invoiceId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const pdfPreview = usePdfPreview();
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["fees", "invoices", status],
    queryFn: async () => (await api.get("/api/fees/invoices", { params: { status: status || undefined } })).data.data,
  });

  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const activeYear = years?.find((y) => y.is_active) ?? years?.[0];

  const [month] = useState(new Date().getMonth() + 1);
  const [year] = useState(new Date().getFullYear());
  const [waiveTarget, setWaiveTarget] = useState<Invoice | null>(null);
  const [waiveReason, setWaiveReason] = useState("");

  const waiveMutation = useMutation({
    mutationFn: () => api.put(`/api/fees/invoices/${waiveTarget!.id}/waive`, { reason: waiveReason }),
    onSuccess: () => {
      toast.success("Invoice waived");
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] });
      setWaiveTarget(null);
      setWaiveReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to waive invoice"),
  });

  const bulkGenerateMutation = useMutation({
    mutationFn: () => api.post("/api/fees/invoices/generate-bulk-monthly", { academic_year_id: activeYear?.id, month, year }),
    onSuccess: (res) => {
      toast.success(`Generated ${res.data.data.created} invoices (${res.data.data.skipped_duplicates} already existed)`);
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Invoices"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Invoices" }]}
        action={<Button onClick={() => bulkGenerateMutation.mutate()} disabled={bulkGenerateMutation.isPending || !activeYear}>Generate Monthly Invoices</Button>}
      />

      <select className="w-48 rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All Status</option>
        <option value="PENDING">Pending</option>
        <option value="PARTIAL">Partial</option>
        <option value="PAID">Paid</option>
        <option value="OVERDUE">Overdue</option>
        <option value="WAIVED">Waived</option>
      </select>

      {!invoices?.length && <EmptyState title="No invoices found" />}
      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Student</th><th className="p-2">Description</th><th className="p-2">Due</th><th className="p-2">Paid</th><th className="p-2">Fine</th><th className="p-2">Due Date</th><th className="p-2">Status</th><th className="p-2" /></tr></thead>
            <tbody>
              {invoices?.map((inv) => (
                <tr key={inv.id} className="border-b">
                  <td className="p-2">{inv.student.name_en} <span className="font-mono text-xs text-muted-foreground">{inv.student.student_uid}</span></td>
                  <td className="p-2">{inv.description}</td>
                  <td className="p-2">৳{inv.amount_due}</td>
                  <td className="p-2">৳{inv.amount_paid}</td>
                  <td className="p-2">৳{inv.fine_amount}</td>
                  <td className="p-2">{new Date(inv.due_date).toLocaleDateString()}</td>
                  <td className="p-2"><StatusBadge status={inv.status} /></td>
                  <td className="p-2 text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/fee/invoice/${inv.id}`, `Invoice — ${inv.student.name_en}`)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv.id)}>Download</Button>
                    {canWaive(inv.status) && (
                      <Button size="sm" variant="outline" onClick={() => setWaiveTarget(inv)}>Waive</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <PdfPreviewModal
        open={pdfPreview.open}
        onOpenChange={(open) => !open && pdfPreview.closePreview()}
        title={pdfPreview.title}
        pdfUrl={pdfPreview.url}
      />

      <Dialog open={!!waiveTarget} onOpenChange={(open) => { if (!open) { setWaiveTarget(null); setWaiveReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Waive Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {waiveTarget && (
              <p className="text-sm text-muted-foreground">
                {waiveTarget.student.name_en} — {waiveTarget.description} — ৳{waiveTarget.amount_due}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="e.g. Sibling discount approved by Principal" />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!waiveReason || waiveMutation.isPending} onClick={() => waiveMutation.mutate()}>
              {waiveMutation.isPending ? "Waiving..." : "Confirm Waive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
