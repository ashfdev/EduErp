"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, EmptyState, Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from "@education-erp/ui";
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

  async function exportLedger() {
    const res = await api.get(`/api/accounts/ledger/${accountId}/export`, {
      params: { from_date: fromDate || undefined, to_date: toDate || undefined },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ledger_${ledger?.account.code ?? accountId}.xlsx`;
    a.click();
  }

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
          <Button variant="outline" disabled={!accountId} onClick={exportLedger}>Export</Button>
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher No</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.entries.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(e.date).toLocaleDateString()}</TableCell>
                      <TableCell>{e.voucher_no}</TableCell>
                      <TableCell>{e.narration}</TableCell>
                      <TableCell>{e.debit ? `৳${e.debit.toLocaleString()}` : "—"}</TableCell>
                      <TableCell>{e.credit ? `৳${e.credit.toLocaleString()}` : "—"}</TableCell>
                      <TableCell>৳{Math.abs(e.running_balance).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Closing Balance</TableCell>
                    <TableCell>৳{ledger.total_debit.toLocaleString()}</TableCell>
                    <TableCell>৳{ledger.total_credit.toLocaleString()}</TableCell>
                    <TableCell>৳{ledger.closing_balance.amount.toLocaleString()} {ledger.closing_balance.type}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageWrapper>
  );
}
