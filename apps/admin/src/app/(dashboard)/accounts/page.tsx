"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AccountGroup {
  id: string;
  name: string;
  accounts: { id: string; code: string; name: string; balance: number; is_cash_account: boolean; is_bank_account: boolean }[];
}

interface Voucher {
  id: string;
  voucher_no: string;
  voucher_type: string;
  narration: string;
  total_amount: number;
  status: string;
  date: string;
}

function fmt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function AccountsDashboardPage() {
  const { data: chart } = useQuery<AccountGroup[]>({
    queryKey: ["accounts", "chart"],
    queryFn: async () => (await api.get("/api/accounts/chart")).data.data,
  });

  const { data: vouchers } = useQuery<Voucher[]>({
    queryKey: ["accounts", "vouchers", "recent"],
    queryFn: async () => (await api.get("/api/accounts/vouchers", { params: { limit: 10 } })).data.data,
  });

  const assetsGroup = chart?.find((g) => g.name === "Assets");
  const cashInHand = assetsGroup?.accounts.find((a) => a.is_cash_account)?.balance ?? 0;
  const cashAtBank = assetsGroup?.accounts.find((a) => a.is_bank_account)?.balance ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const { data: dayBook } = useQuery<{ voucher_type: string; journal_entries: { debit_account_id: string | null; credit_account_id: string | null; amount: number }[] }[]>({
    queryKey: ["accounts", "day-book", today],
    queryFn: async () => (await api.get("/api/accounts/reports/day-book", { params: { date: today } })).data.data,
  });

  const pendingApprovals = vouchers?.filter((v) => v.status === "DRAFT" || v.status === "APPROVED") ?? [];

  const { data: journalFailures } = useQuery<{ id: string }[]>({
    queryKey: ["accounts", "journal-failures", false],
    queryFn: async () => (await api.get("/api/accounts/journal-failures", { params: { resolved: "false" } })).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Accounts"
        subtitle="Double-entry accounting — chart of accounts, vouchers, ledger, financial statements"
        breadcrumbs={[{ label: "Accounts" }]}
        action={
          <div className="flex gap-2">
            <Link href="/accounts/chart"><Button variant="outline" size="sm">Chart of Accounts</Button></Link>
            <Link href="/accounts/receipts"><Button variant="outline" size="sm">Fee Receipts</Button></Link>
            <Link href="/accounts/ledger"><Button variant="outline" size="sm">Ledger</Button></Link>
            <Link href="/accounts/reports"><Button variant="outline" size="sm">Reports</Button></Link>
            <Link href="/accounts/import-export"><Button variant="outline" size="sm">Import / Export</Button></Link>
            <Link href="/accounts/journal-failures"><Button variant="outline" size="sm">Journal Failures{journalFailures?.length ? ` (${journalFailures.length})` : ""}</Button></Link>
            <Link href="/accounts/vouchers/new"><Button size="sm">+ New Voucher</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Cash in Hand</p><p className="text-2xl font-semibold">{fmt(cashInHand)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Cash at Bank</p><p className="text-2xl font-semibold">{fmt(cashAtBank)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Today&apos;s Vouchers</p><p className="text-2xl font-semibold">{dayBook?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pending Approvals</p><p className="text-2xl font-semibold">{pendingApprovals.length}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 font-medium">Recent Vouchers</p>
            {!vouchers?.length && <EmptyState title="No vouchers yet" description="Create your first voucher to get started." />}
            <div className="space-y-2">
              {vouchers?.slice(0, 10).map((v) => (
                <Link key={v.id} href={`/accounts/vouchers/${v.id}`} className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent">
                  <div>
                    <p className="font-medium">{v.voucher_no}</p>
                    <p className="text-xs text-muted-foreground">{v.narration.slice(0, 50)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{fmt(v.total_amount)}</span>
                    <StatusBadge status={v.status} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 font-medium">Pending Approvals</p>
            {!pendingApprovals.length && <EmptyState title="Nothing pending" description="All vouchers are posted." />}
            <div className="space-y-2">
              {pendingApprovals.map((v) => (
                <Link key={v.id} href={`/accounts/vouchers/${v.id}`} className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent">
                  <span className="font-medium">{v.voucher_no}</span>
                  <StatusBadge status={v.status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
