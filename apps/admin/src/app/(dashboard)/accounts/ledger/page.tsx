"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface LedgerEntry {
  date: string;
  voucher_no: string;
  voucher_type: string;
  narration: string;
  debit: number;
  credit: number;
  running_balance: number;
}

interface LedgerData {
  account: { code: string; name: string; nature: string };
  opening_balance: { amount: number; type: "DR" | "CR" };
  entries: LedgerEntry[];
  closing_balance: { amount: number; type: "DR" | "CR" };
  total_debit: number;
  total_credit: number;
}

export default function LedgerPage() {
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: accounts } = useQuery<AccountOption[]>({
    queryKey: ["accounts", "search", ""],
    queryFn: async () => (await api.get("/api/accounts/search")).data.data,
  });

  const { data: ledger } = useQuery<LedgerData>({
    queryKey: ["accounts", "ledger", accountId, fromDate, toDate],
    queryFn: async () => (await api.get(`/api/accounts/ledger/${accountId}`, { params: { from_date: fromDate || undefined, to_date: toDate || undefined } })).data.data,
    enabled: !!accountId,
  });

  return (
    <PageWrapper>
      <PageHeader title="Ledger" breadcrumbs={[{ label: "Accounts" }, { label: "Ledger" }]} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select an account" /></SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => <SelectItem key={a.id} value={a.id}>({a.code}) {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
        </CardContent>
      </Card>

      {!accountId ? (
        <EmptyState title="Select an account" description="Choose an account above to view its ledger." />
      ) : ledger ? (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">({ledger.account.code}) {ledger.account.name}</p>
              <p className="text-sm text-muted-foreground">Opening: ৳{ledger.opening_balance.amount.toLocaleString()} {ledger.opening_balance.type}</p>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Date</th>
                    <th className="p-2">Voucher No</th>
                    <th className="p-2">Narration</th>
                    <th className="p-2">Debit</th>
                    <th className="p-2">Credit</th>
                    <th className="p-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2">{new Date(e.date).toLocaleDateString()}</td>
                      <td className="p-2">{e.voucher_no}</td>
                      <td className="p-2">{e.narration}</td>
                      <td className="p-2">{e.debit ? `৳${e.debit.toLocaleString()}` : "—"}</td>
                      <td className="p-2">{e.credit ? `৳${e.credit.toLocaleString()}` : "—"}</td>
                      <td className="p-2">৳{Math.abs(e.running_balance).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className="p-2" colSpan={3}>Closing Balance</td>
                    <td className="p-2">৳{ledger.total_debit.toLocaleString()}</td>
                    <td className="p-2">৳{ledger.total_credit.toLocaleString()}</td>
                    <td className="p-2">৳{ledger.closing_balance.amount.toLocaleString()} {ledger.closing_balance.type}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageWrapper>
  );
}
