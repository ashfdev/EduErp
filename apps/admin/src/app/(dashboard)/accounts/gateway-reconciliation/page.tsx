"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Badge, Button, Input, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

const ONLINE_GATEWAYS = ["BKASH", "NAGAD", "SSLCOMMERZ", "ROCKET", "AAMARPAY"] as const;
const STATUSES = ["INITIATED", "COMPLETED", "FAILED", "REFUNDED"] as const;

interface TransactionRow {
  id: string;
  receipt_no: string | null;
  amount: number;
  gateway: string;
  status: string;
  transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  invoice: {
    category: string;
    student: { id: string; name_en: string; student_uid: string } | null;
    application: { id: string; applicant_name: string; admission_roll: string } | null;
  };
}
interface SummaryRow {
  gateway: string;
  status: string;
  count: number;
  total_amount: number;
}
interface ReconciliationResponse {
  data: TransactionRow[];
  summary: SummaryRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  COMPLETED: "success",
  INITIATED: "warning",
  FAILED: "destructive",
  REFUNDED: "secondary",
};

export default function GatewayReconciliationPage() {
  const [gateway, setGateway] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery<ReconciliationResponse>({
    queryKey: ["accounts", "gateway-reconciliation", gateway, status, from, to, page],
    queryFn: async () =>
      (
        await api.get("/api/payments/gateway-reconciliation", {
          params: { gateway: gateway || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page, limit: 20 },
        })
      ).data,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const summary = data?.summary ?? [];

  // Group the flat (gateway, status) summary rows into one row per gateway
  // with per-status counts/totals, so the top panel reads as a real
  // cross-check grid (gateway columns down, status columns across) instead
  // of a scattered list.
  const summaryByGateway = ONLINE_GATEWAYS.map((g) => {
    const rowsForGateway = summary.filter((s) => s.gateway === g);
    const total = rowsForGateway.reduce((sum, s) => sum + s.total_amount, 0);
    const totalCount = rowsForGateway.reduce((sum, s) => sum + s.count, 0);
    return {
      gateway: g,
      total,
      totalCount,
      byStatus: Object.fromEntries(STATUSES.map((st) => [st, rowsForGateway.find((s) => s.status === st) ?? { count: 0, total_amount: 0 }])),
    };
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Gateway Transaction Reconciliation"
        subtitle="Every online-gateway payment attempt in one place — real transaction ID, amount, and status, cross-checked across bKash/Nagad/Rocket/SSLCommerz/AamarPay."
        breadcrumbs={[{ label: "Accounts", href: "/accounts" }, { label: "Gateway Reconciliation" }]}
      />

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summaryByGateway.map((g) => (
            <Card key={g.gateway}>
              <CardContent className="space-y-2 p-4">
                <div className="text-sm font-semibold">{g.gateway}</div>
                <div className="text-lg font-bold">৳{g.total.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{g.totalCount} transaction(s)</div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {STATUSES.map((st) => {
                    const s = g.byStatus[st] ?? { count: 0, total_amount: 0 };
                    if (!s.count) return null;
                    return (
                      <Badge key={st} variant={STATUS_VARIANT[st]} className="text-[10px]">
                        {st}: {s.count}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-sm text-muted-foreground">Gateway</label>
          <select className="block rounded-md border px-3 py-2 text-sm" value={gateway} onChange={(e) => { setGateway(e.target.value); setPage(1); }}>
            <option value="">All gateways</option>
            {ONLINE_GATEWAYS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Status</label>
          <select className="block rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
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
        <ErrorState title="Failed to load gateway transactions" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!rows.length && <EmptyState title="No gateway transactions found" description="Try a different gateway, status, or date range." />}
          {!!rows.length && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gateway</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Student / Applicant</TableHead>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.gateway.replace(/_/g, " ")}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.transaction_id ?? "-"}</TableCell>
                        <TableCell>৳{r.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          {r.invoice.student ? (
                            <>
                              <Link href={`/students/${r.invoice.student.id}`} className="text-primary hover:underline">
                                {r.invoice.student.name_en}
                              </Link>
                              <span className="ml-1 text-xs text-muted-foreground">({r.invoice.student.student_uid})</span>
                            </>
                          ) : r.invoice.application ? (
                            <>
                              <Link href={`/admission/applications/${r.invoice.application.id}`} className="text-primary hover:underline">
                                {r.invoice.application.applicant_name}
                              </Link>
                              <span className="ml-1 text-xs text-muted-foreground">(Applicant — Roll {r.invoice.application.admission_roll})</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Unknown payer</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.receipt_no ?? "-"}</TableCell>
                        <TableCell>{new Date(r.paid_at ?? r.created_at).toLocaleString()}</TableCell>
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
