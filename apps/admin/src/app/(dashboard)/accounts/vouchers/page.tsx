"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, EmptyState, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Input, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Voucher {
  id: string;
  voucher_no: string;
  voucher_type: string;
  narration: string;
  date: string;
  total_amount: number;
  status: string;
}

const TYPES = ["RECEIPT", "PAYMENT", "JOURNAL", "CONTRA"];
const STATUSES = ["DRAFT", "APPROVED", "POSTED", "CANCELLED"];

export default function VouchersPage() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data } = useQuery<{ items: Voucher[]; meta: { total: number; totalPages: number } }>({
    queryKey: ["accounts", "vouchers", type, status, search, page],
    queryFn: async () => {
      const res = await api.get("/api/accounts/vouchers", { params: { type: type || undefined, status: status || undefined, search: search || undefined, page, limit: 20 } });
      return { items: res.data.data, meta: res.data.meta };
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Vouchers" breadcrumbs={[{ label: "Accounts" }, { label: "Vouchers" }]} action={<Link href="/accounts/vouchers/new"><Button size="sm">+ New Voucher</Button></Link>} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <Select value={type || "ALL"} onValueChange={(v) => setType(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">All types</SelectItem>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Search narration…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {!data?.items.length ? (
            <div className="p-6"><EmptyState title="No vouchers found" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell><Link href={`/accounts/vouchers/${v.id}`} className="font-medium text-primary">{v.voucher_no}</Link></TableCell>
                    <TableCell>{v.voucher_type}</TableCell>
                    <TableCell>{new Date(v.date).toLocaleDateString()}</TableCell>
                    <TableCell className="max-w-xs truncate">{v.narration}</TableCell>
                    <TableCell>৳{v.total_amount.toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 p-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {data.meta.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
