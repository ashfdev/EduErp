"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  SearchInput,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface CycleOption {
  id: string;
  name: string;
}

interface AdmissionPaymentRow {
  id: string;
  gateway: string;
  transaction_id: string | null;
  amount: number;
  status: "INITIATED" | "COMPLETED" | "FAILED";
  receipt_no: string | null;
  paid_at: string | null;
  created_at: string;
  slip_url: string | null;
  invoice: {
    category: string;
    description: string;
    application: { id: string; applicant_name: string; admission_roll: string; cycle: { id: string; name: string } } | null;
  };
}

interface PaymentsResponse {
  data: AdmissionPaymentRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  summary: { completed_total: number; completed_count: number; pending_count: number; failed_count: number };
}

const STATUS_LABEL: Record<AdmissionPaymentRow["status"], string> = { INITIATED: "Awaiting Verification", COMPLETED: "Received", FAILED: "Rejected" };
const STATUS_CLASS: Record<AdmissionPaymentRow["status"], string> = {
  INITIATED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function AdmissionPaymentsPage() {
  const queryClient = useQueryClient();
  const [cycleId, setCycleId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: cycles } = useQuery<CycleOption[]>({
    queryKey: ["admission", "cycles", "options"],
    queryFn: async () => (await api.get("/api/admission/cycles")).data.data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery<PaymentsResponse>({
    queryKey: ["admission", "payments", cycleId, status, search, page],
    queryFn: async () =>
      (
        await api.get("/api/admission/payments", {
          params: { cycle_id: cycleId || undefined, status: status || undefined, search: search || undefined, page, limit: 50 },
        })
      ).data,
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/bank-transfers/${id}/verify`),
    onSuccess: () => {
      toast.success("Payment verified — receipt generated and posted");
      queryClient.invalidateQueries({ queryKey: ["admission", "payments"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to verify payment"),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/bank-transfers/${id}/reject`),
    onSuccess: () => {
      toast.success("Payment rejected");
      queryClient.invalidateQueries({ queryKey: ["admission", "payments"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reject payment"),
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const summary = data?.summary;

  return (
    <PageWrapper>
      <PageHeader
        title="Admission Payments"
        subtitle="Every payment against an admission application, pending or received, in one place — cross-check transaction numbers here before verifying."
        breadcrumbs={[{ label: "Admission", href: "/admission" }, { label: "Payments" }]}
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">৳{summary.completed_total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Received</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{summary.completed_count}</p>
              <p className="text-xs text-muted-foreground">Payments Received</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-amber-600">{summary.pending_count}</p>
              <p className="text-xs text-muted-foreground">Awaiting Verification</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-red-600">{summary.failed_count}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          placeholder="Search by applicant, roll, receipt no, or transaction ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={cycleId}
          onChange={(e) => {
            setCycleId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Cycles</option>
          {cycles?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="INITIATED">Awaiting Verification</option>
          <option value="COMPLETED">Received</option>
          <option value="FAILED">Rejected</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load admission payments" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!rows.length && <EmptyState title="No admission payments found" description="Try a different cycle, status, or search term." />}
          {!!rows.length && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Cycle</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.invoice.application ? (
                            <>
                              <Link href={`/admission/applications/${r.invoice.application.id}`} className="text-primary hover:underline">
                                {r.invoice.application.applicant_name}
                              </Link>
                              <span className="ml-1 text-xs text-muted-foreground">(Roll {r.invoice.application.admission_roll})</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Unknown applicant</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.invoice.application?.cycle.name ?? "-"}</TableCell>
                        <TableCell>{r.gateway.replace(/_/g, " ")}</TableCell>
                        <TableCell className="font-mono text-xs">{r.transaction_id ?? "-"}</TableCell>
                        <TableCell>৳{r.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.paid_at ?? r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-2">
                          {r.slip_url && (
                            <a href={r.slip_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View Slip</a>
                          )}
                          {r.status === "INITIATED" && (
                            <>
                              <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(r.id)} disabled={rejectMutation.isPending}>Reject</Button>
                              <Button size="sm" onClick={() => verifyMutation.mutate(r.id)} disabled={verifyMutation.isPending}>Verify</Button>
                            </>
                          )}
                          {r.status === "COMPLETED" && r.receipt_no && <span className="text-xs text-muted-foreground">{r.receipt_no}</span>}
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
    </PageWrapper>
  );
}
