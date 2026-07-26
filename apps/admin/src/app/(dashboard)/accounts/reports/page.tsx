"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Table, TableBody, TableRow, TableCell,
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface TrialBalanceRow { code: string; name: string; debit: number; credit: number }
interface TrialBalanceData { groups: { group: string; accounts: TrialBalanceRow[] }[]; total_debit: number; total_credit: number; is_balanced: boolean }

interface IncomeExpenditureRow { code: string; name: string; amount: number }
interface IncomeExpenditureData { income: IncomeExpenditureRow[]; income_total: number; expenditure: IncomeExpenditureRow[]; expenditure_total: number; surplus_or_deficit: number }

interface BalanceSheetRow { code: string; name: string; balance: number; is_contra?: boolean }
interface BalanceSheetData { assets: BalanceSheetRow[]; total_assets: number; liabilities: BalanceSheetRow[]; total_liabilities: number; equity: BalanceSheetRow[]; total_equity: number; total_liabilities_and_equity: number; is_balanced: boolean }

function TrialBalanceView() {
  const { data } = useQuery<TrialBalanceData>({ queryKey: ["accounts", "trial-balance"], queryFn: async () => (await api.get("/api/accounts/reports/trial-balance")).data.data });
  if (!data) return null;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {!data.is_balanced && <p className="rounded-md bg-red-50 p-2 text-sm font-medium text-red-700">⚠️ Trial Balance is NOT balanced</p>}
        {data.groups.map((g) => (
          <div key={g.group}>
            <p className="mb-1 font-medium">{g.group}</p>
            <Table>
              <TableBody>
                {g.accounts.map((a) => (
                  <TableRow key={a.code}>
                    <TableCell className="font-mono text-muted-foreground">{a.code}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell className="text-right">{a.debit ? `৳${a.debit.toLocaleString()}` : ""}</TableCell>
                    <TableCell className="text-right">{a.credit ? `৳${a.credit.toLocaleString()}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total: ৳{data.total_debit.toLocaleString()} / ৳{data.total_credit.toLocaleString()}</span>
          <span className={data.is_balanced ? "text-green-700" : "text-red-700"}>{data.is_balanced ? "✅ Balanced" : "⚠️ Unbalanced"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeExpenditureView() {
  const { data } = useQuery<IncomeExpenditureData>({ queryKey: ["accounts", "income-expenditure"], queryFn: async () => (await api.get("/api/accounts/reports/income-expenditure")).data.data });
  if (!data) return null;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="mb-1 font-medium">Income</p>
          {data.income.map((r) => <div key={r.code} className="flex justify-between border-b py-1 text-sm"><span>{r.name}</span><span>৳{r.amount.toLocaleString()}</span></div>)}
          <div className="flex justify-between pt-1 text-sm font-medium"><span>Total Income</span><span>৳{data.income_total.toLocaleString()}</span></div>
        </div>
        <div>
          <p className="mb-1 font-medium">Expenditure</p>
          {data.expenditure.map((r) => <div key={r.code} className="flex justify-between border-b py-1 text-sm"><span>{r.name}</span><span>৳{r.amount.toLocaleString()}</span></div>)}
          <div className="flex justify-between pt-1 text-sm font-medium"><span>Total Expenditure</span><span>৳{data.expenditure_total.toLocaleString()}</span></div>
        </div>
        <div className={`rounded-md p-2 text-center font-medium ${data.surplus_or_deficit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {data.surplus_or_deficit >= 0 ? "Surplus" : "Deficit"}: ৳{Math.abs(data.surplus_or_deficit).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceSheetView() {
  const { data } = useQuery<BalanceSheetData>({ queryKey: ["accounts", "balance-sheet"], queryFn: async () => (await api.get("/api/accounts/reports/balance-sheet")).data.data });
  if (!data) return null;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {!data.is_balanced && <p className="rounded-md bg-red-50 p-2 text-sm font-medium text-red-700">⚠️ Balance sheet does not balance</p>}
        <div>
          <p className="mb-1 font-medium">Assets</p>
          {data.assets.map((r) => (
            <div key={r.code} className="flex justify-between border-b py-1 text-sm">
              <span>{r.is_contra ? `Less: ${r.name}` : r.name}</span>
              <span>{r.is_contra ? `(৳${r.balance.toLocaleString()})` : `৳${r.balance.toLocaleString()}`}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 text-sm font-medium"><span>Total Assets</span><span>৳{data.total_assets.toLocaleString()}</span></div>
        </div>
        <div>
          <p className="mb-1 font-medium">Liabilities</p>
          {data.liabilities.map((r) => <div key={r.code} className="flex justify-between border-b py-1 text-sm"><span>{r.name}</span><span>৳{r.balance.toLocaleString()}</span></div>)}
        </div>
        <div>
          <p className="mb-1 font-medium">Equity</p>
          {data.equity.map((r) => <div key={r.code} className="flex justify-between border-b py-1 text-sm"><span>{r.name}</span><span>৳{r.balance.toLocaleString()}</span></div>)}
        </div>
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total Liabilities + Equity: ৳{data.total_liabilities_and_equity.toLocaleString()}</span>
          <span className={data.is_balanced ? "text-green-700" : "text-red-700"}>{data.is_balanced ? "✅ Balanced" : "⚠️"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

interface LedgerEntry { date: string; voucher_no: string; voucher_type: string; narration: string | null; debit: number; credit: number; running_balance: number }
interface LedgerData {
  account: { code: string; name: string };
  opening_balance: { amount: number; type: "DR" | "CR" };
  entries: LedgerEntry[];
  closing_balance: { amount: number; type: "DR" | "CR" };
  total_debit: number;
  total_credit: number;
}

// Shared by Cash Book and Bank Book — both are just the general ledger view
// for one fixed system account (accounts/reports.routes.ts's /cash-book and
// /bank-book routes are thin 307 redirects to /api/accounts/ledger/:id,
// which axios follows transparently on a GET) (Plan Fifteen, Phase F).
function LedgerBookView({ endpoint }: { endpoint: string }) {
  const [fromDate, setFromDate] = useState(monthStartStr());
  const [toDate, setToDate] = useState(todayStr());
  const { data } = useQuery<LedgerData>({
    queryKey: ["accounts", endpoint, fromDate, toDate],
    queryFn: async () => (await api.get(endpoint, { params: { from_date: fromDate, to_date: toDate } })).data.data,
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
          <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        </div>
        {!data && <EmptyState title="Loading..." />}
        {data && (
          <>
            <p className="text-sm text-muted-foreground">
              {data.account.name} — Opening: ৳{data.opening_balance.amount.toLocaleString()} {data.opening_balance.type}
            </p>
            {!data.entries.length && <EmptyState title="No transactions in this range" />}
            {!!data.entries.length && (
              <Table>
                <TableBody>
                  {data.entries.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(e.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-xs">{e.voucher_no}</TableCell>
                      <TableCell>{e.narration}</TableCell>
                      <TableCell className="text-right">{e.debit ? `৳${e.debit.toLocaleString()}` : ""}</TableCell>
                      <TableCell className="text-right">{e.credit ? `৳${e.credit.toLocaleString()}` : ""}</TableCell>
                      <TableCell className="text-right font-medium">৳{e.running_balance.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Total: ৳{data.total_debit.toLocaleString()} / ৳{data.total_credit.toLocaleString()}</span>
              <span>Closing: ৳{data.closing_balance.amount.toLocaleString()} {data.closing_balance.type}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface DayBookVoucher {
  id: string;
  voucher_no: string;
  voucher_type: string;
  date: string;
  narration: string | null;
  journal_entries: { amount: number; debit_account: { code: string; name: string }; credit_account: { code: string; name: string } }[];
}

function DayBookView() {
  const [date, setDate] = useState(todayStr());
  const { data } = useQuery<DayBookVoucher[]>({
    queryKey: ["accounts", "day-book", date],
    queryFn: async () => (await api.get("/api/accounts/reports/day-book", { params: { date } })).data.data,
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5 w-40"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {!data?.length && <EmptyState title="No vouchers posted on this date" />}
        {!!data?.length && (
          <div className="space-y-3">
            {data.map((v) => (
              <div key={v.id} className="rounded-md border p-3">
                <div className="flex justify-between text-sm font-medium">
                  <span className="font-mono">{v.voucher_no} · {v.voucher_type}</span>
                  <span className="text-muted-foreground">{v.narration}</span>
                </div>
                <Table>
                  <TableBody>
                    {v.journal_entries.map((je, i) => (
                      <TableRow key={i}>
                        <TableCell>{je.debit_account.name} (Dr)</TableCell>
                        <TableCell>{je.credit_account.name} (Cr)</TableCell>
                        <TableCell className="text-right">৳{je.amount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BudgetOption { id: string; name: string; status: string }
interface BudgetVsActualRow { code: string; name: string; budgeted: number; actual: number; variance: number; percent_used: number; over_budget: boolean }
interface BudgetVsActualData { budget: { id: string; name: string; status: string }; rows: BudgetVsActualRow[] }

function BudgetVsActualView() {
  const { data: budgets } = useQuery<BudgetOption[]>({ queryKey: ["accounts", "budgets"], queryFn: async () => (await api.get("/api/accounts/budgets")).data.data });
  const [budgetId, setBudgetId] = useState("");
  const { data } = useQuery<BudgetVsActualData>({
    queryKey: ["accounts", "budget-vs-actual", budgetId],
    queryFn: async () => (await api.get("/api/accounts/reports/budget-vs-actual", { params: { budget_id: budgetId } })).data.data,
    enabled: !!budgetId,
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5 w-64">
          <Label className="text-xs">Budget</Label>
          <Select value={budgetId} onValueChange={setBudgetId}>
            <SelectTrigger><SelectValue placeholder="Select a budget..." /></SelectTrigger>
            <SelectContent>
              {budgets?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.status})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!budgetId && <EmptyState title="Select a budget to compare against actuals" />}
        {budgetId && !data && <EmptyState title="Loading..." />}
        {data && (
          <Table>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="font-mono text-muted-foreground">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">৳{r.budgeted.toLocaleString()}</TableCell>
                  <TableCell className="text-right">৳{r.actual.toLocaleString()}</TableCell>
                  <TableCell className={`text-right ${r.variance < 0 ? "text-red-600" : "text-green-700"}`}>৳{r.variance.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.over_budget ? "font-medium text-red-600" : ""}>{r.percent_used}%</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function AccountsReportsPage() {
  const [tab, setTab] = useState("trial-balance");

  return (
    <PageWrapper>
      <PageHeader title="Financial Reports" breadcrumbs={[{ label: "Accounts" }, { label: "Reports" }]} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="income-expenditure">Income & Expenditure</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="day-book">Day Book</TabsTrigger>
          <TabsTrigger value="cash-book">Cash Book</TabsTrigger>
          <TabsTrigger value="bank-book">Bank Book</TabsTrigger>
          <TabsTrigger value="budget-vs-actual">Budget vs Actual</TabsTrigger>
        </TabsList>
        <TabsContent value="trial-balance"><TrialBalanceView /></TabsContent>
        <TabsContent value="income-expenditure"><IncomeExpenditureView /></TabsContent>
        <TabsContent value="balance-sheet"><BalanceSheetView /></TabsContent>
        <TabsContent value="day-book"><DayBookView /></TabsContent>
        <TabsContent value="cash-book"><LedgerBookView endpoint="/api/accounts/reports/cash-book" /></TabsContent>
        <TabsContent value="bank-book"><LedgerBookView endpoint="/api/accounts/reports/bank-book" /></TabsContent>
        <TabsContent value="budget-vs-actual"><BudgetVsActualView /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
