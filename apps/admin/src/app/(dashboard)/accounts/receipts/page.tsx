"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, SearchInput, EmptyState, PdfPreviewModal, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface ReceiptRow {
  id: string;
  receipt_no: string | null;
  amount: number;
  paid_at: string | null;
  invoice: { category: string; student: { id: string; name_en: string; student_uid: string } };
}
interface ReceiptsResponse {
  data: ReceiptRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

async function downloadReceiptPdf(paymentId: string, receiptNo: string | null) {
  const res = await api.get(`/api/documents/fee/receipt/${paymentId}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${receiptNo ?? `Receipt_${paymentId}`}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FeeReceiptsPage() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pdfPreview = usePdfPreview();

  const { data, isLoading, isError, error, refetch } = useQuery<ReceiptsResponse>({
    queryKey: ["accounts", "receipts", search, from, to, page],
    queryFn: async () =>
      (
        await api.get("/api/payments", {
          params: { search: search || undefined, from: from || undefined, to: to || undefined, page, limit: 20 },
        })
      ).data,
  });

  const receipts = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageWrapper>
      <PageHeader
        title="Fee Receipts"
        subtitle="Search and reprint any past payment receipt"
        breadcrumbs={[{ label: "Accounts", href: "/accounts" }, { label: "Receipts" }]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          placeholder="Search by student name, ID, or receipt no..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <div>
          <label className="text-sm text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load receipts" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!receipts.length && <EmptyState title="No receipts found" description="Try a different name, ID, receipt number, or date range." />}
      {!!receipts.length && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid At</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.receipt_no ?? "-"}</TableCell>
                    <TableCell>
                      <Link href={`/students/${r.invoice.student.id}`} className="text-primary hover:underline">
                        {r.invoice.student.name_en}
                      </Link>
                      <span className="ml-1 text-xs text-muted-foreground">({r.invoice.student.student_uid})</span>
                    </TableCell>
                    <TableCell>{r.invoice.category.replace(/_/g, " ")}</TableCell>
                    <TableCell>৳{r.amount.toLocaleString()}</TableCell>
                    <TableCell>{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/fee/receipt/${r.id}`, `Receipt — ${r.invoice.student.name_en}`)}>
                        View
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadReceiptPdf(r.id, r.receipt_no)}>
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between p-3">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </>
      )}

      <PdfPreviewModal open={pdfPreview.open} onOpenChange={(open) => !open && pdfPreview.closePreview()} title={pdfPreview.title} pdfUrl={pdfPreview.url} />
    </PageWrapper>
  );
}
