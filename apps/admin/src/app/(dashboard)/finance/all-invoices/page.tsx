"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Badge, StatusBadge, SearchInput, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Input, Label,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface UnifiedInvoiceRow {
  id: string;
  type: "FEE" | "PAYROLL" | "PURCHASE";
  reference_no: string;
  party_name: string;
  party_detail: string | null;
  description: string;
  amount: number;
  paid: number;
  status: string;
  date: string;
}
interface UnifiedInvoiceResponse {
  data: UnifiedInvoiceRow[];
  meta: { total: number; total_amount: number; total_paid: number };
}

const TYPE_LABEL: Record<UnifiedInvoiceRow["type"], string> = {
  FEE: "Student Fee",
  PAYROLL: "HR / Payroll",
  PURCHASE: "Purchase / Vendor",
};
const TYPE_BADGE_VARIANT: Record<UnifiedInvoiceRow["type"], "default" | "secondary" | "outline"> = {
  FEE: "default",
  PAYROLL: "secondary",
  PURCHASE: "outline",
};

export default function AllInvoicesPage() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isFetching, isLoading, isError, error, refetch } = useQuery<UnifiedInvoiceResponse>({
    queryKey: ["finance", "all-invoices", type, status, search, from, to],
    queryFn: async () =>
      (
        await api.get("/api/finance/all-invoices", {
          params: {
            type: type || undefined,
            status: status || undefined,
            search: search || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
  });

  const rows = data?.data ?? [];

  return (
    <PageWrapper>
      <PageHeader
        title="All Invoices"
        subtitle="Every fee invoice, payroll bill, and purchase order in one place — filter by type or see everything at once"
        breadcrumbs={[{ label: "Finance", href: "/fees" }, { label: "All Invoices" }]}
      />

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold">{data?.meta.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Records</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold">৳{data?.meta.total_amount ?? 0}</p><p className="text-sm text-muted-foreground">Total Amount</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold text-emerald-600">৳{data?.meta.total_paid ?? 0}</p><p className="text-sm text-muted-foreground">Total Paid</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="FEE">Student Fee</SelectItem>
              <SelectItem value="PAYROLL">HR / Payroll</SelectItem>
              <SelectItem value="PURCHASE">Purchase / Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Input className="w-36" placeholder="e.g. PAID" value={status} onChange={(e) => setStatus(e.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label className="text-xs">Search (student / staff / supplier name)</Label>
          <SearchInput placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load invoices" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!isFetching && !rows.length && <EmptyState title="No records match this filter" />}

      {!!rows.length && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.type}-${r.id}`}>
                    <TableCell><Badge variant={TYPE_BADGE_VARIANT[r.type]}>{TYPE_LABEL[r.type]}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.reference_no}</TableCell>
                    <TableCell>
                      <p className="font-medium">{r.party_name}</p>
                      {r.party_detail && <p className="font-mono text-xs text-muted-foreground">{r.party_detail}</p>}
                    </TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell>৳{r.amount.toLocaleString()}</TableCell>
                    <TableCell>৳{r.paid.toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>{new Date(r.date).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </PageWrapper>
  );
}
