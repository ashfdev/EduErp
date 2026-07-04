"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, EmptyState, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Input } from "@education-erp/ui";
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
        <CardContent className="pt-6">
          {!data?.items.length ? (
            <EmptyState title="No vouchers found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Voucher No</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Narration</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-accent">
                      <td className="py-2 pr-4"><Link href={`/accounts/vouchers/${v.id}`} className="font-medium text-primary">{v.voucher_no}</Link></td>
                      <td className="py-2 pr-4">{v.voucher_type}</td>
                      <td className="py-2 pr-4">{new Date(v.date).toLocaleDateString()}</td>
                      <td className="max-w-xs truncate py-2 pr-4">{v.narration}</td>
                      <td className="py-2 pr-4">৳{v.total_amount.toLocaleString()}</td>
                      <td className="py-2 pr-4"><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
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
