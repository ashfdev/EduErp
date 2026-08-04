"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, ErrorState, Input, Label, LoadingSpinner, StatusBadge, EmptyState, PdfPreviewModal, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface Invoice {
  id: string;
  invoice_no: string | null;
  description: string;
  period: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  status: string;
  due_date: string;
  // Nullable on both sides -- an admission-applicant's invoice has no
  // Student yet (only claimed at enroll time), while every other invoice
  // has no AdmissionApplication. Exactly one of the two is ever set.
  student: { name_en: string; student_uid: string; current_class?: { name_en: string } | null } | null;
  application: { id: string; applicant_name: string; admission_roll: string } | null;
}

function payerName(inv: Pick<Invoice, "student" | "application">): string {
  return inv.student?.name_en ?? inv.application?.applicant_name ?? "Unknown payer";
}

function canWaive(status: string) {
  return status !== "PAID" && status !== "WAIVED";
}
interface YearOption { id: string; is_active: boolean }
interface ClassOption { id: string; name_en: string }

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function downloadInvoicePdf(invoiceId: string, invoiceNo: string | null) {
  const res = await api.get(`/api/documents/fee/invoice/${invoiceId}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Invoice_${invoiceNo ?? invoiceId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const pdfPreview = usePdfPreview();
  const { data: invoices, isLoading, isError, error, refetch } = useQuery<Invoice[]>({
    queryKey: ["fees", "invoices", status, classId, monthFilter, yearFilter],
    queryFn: async () =>
      (
        await api.get("/api/fees/invoices", {
          params: {
            status: status || undefined,
            class_id: classId || undefined,
            month: monthFilter || undefined,
            year: yearFilter || undefined,
          },
        })
      ).data.data,
  });

  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
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
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to generate monthly invoices"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Invoices"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Invoices" }]}
        action={<Button onClick={() => bulkGenerateMutation.mutate()} disabled={bulkGenerateMutation.isPending || !activeYear}>Generate Monthly Invoices</Button>}
      />

      <div className="flex flex-wrap gap-3">
        <select className="w-44 rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="WAIVED">Waived</option>
        </select>

        <Select value={classId || "all"} onValueChange={(v) => setClassId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={monthFilter || "all"} onValueChange={(v) => setMonthFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={yearFilter || "all"} onValueChange={(v) => setYearFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="All Years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load invoices" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!invoices?.length && <EmptyState title="No invoices found" />}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Fine</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices?.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_no ?? "—"}</TableCell>
                  <TableCell>
                    {inv.student ? (
                      <>{inv.student.name_en} <span className="font-mono text-xs text-muted-foreground">{inv.student.student_uid}</span></>
                    ) : inv.application ? (
                      <>{inv.application.applicant_name} <span className="text-xs text-muted-foreground">(Applicant — Roll {inv.application.admission_roll})</span></>
                    ) : (
                      <span className="text-muted-foreground">Unknown payer</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {inv.description}
                    <div className="text-xs text-muted-foreground">{inv.period}</div>
                  </TableCell>
                  <TableCell>৳{inv.amount_due}</TableCell>
                  <TableCell>৳{inv.amount_paid}</TableCell>
                  <TableCell>৳{inv.fine_amount}</TableCell>
                  <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/fee/invoice/${inv.id}`, `Invoice ${inv.invoice_no ?? ""} — ${payerName(inv)}`)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv.id, inv.invoice_no)}>Download</Button>
                    {canWaive(inv.status) && (
                      <Button size="sm" variant="outline" onClick={() => setWaiveTarget(inv)}>Waive</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </>
      )}

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
                {payerName(waiveTarget)} — {waiveTarget.description} — ৳{waiveTarget.amount_due}
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
