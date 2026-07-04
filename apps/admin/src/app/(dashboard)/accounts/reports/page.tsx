"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from "@education-erp/ui";
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
            <table className="w-full text-sm">
              <tbody>
                {g.accounts.map((a) => (
                  <tr key={a.code} className="border-b">
                    <td className="py-1 font-mono text-muted-foreground">{a.code}</td>
                    <td className="py-1">{a.name}</td>
                    <td className="py-1 text-right">{a.debit ? `৳${a.debit.toLocaleString()}` : ""}</td>
                    <td className="py-1 text-right">{a.credit ? `৳${a.credit.toLocaleString()}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        </TabsList>
        <TabsContent value="trial-balance"><TrialBalanceView /></TabsContent>
        <TabsContent value="income-expenditure"><IncomeExpenditureView /></TabsContent>
        <TabsContent value="balance-sheet"><BalanceSheetView /></TabsContent>
      </Tabs>
      <Card><CardContent className="pt-6"><EmptyState title="More reports via API" description="Day book, cash book, bank book, account summary, and budget-vs-actual are all available via the API but don't yet have dedicated report pages here." /></CardContent></Card>
    </PageWrapper>
  );
}
