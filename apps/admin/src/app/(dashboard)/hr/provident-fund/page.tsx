"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, EmptyState, Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage, Badge,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffOption { id: string; name_en: string; staff_uid: string; department: { name_en: string } | null; }
interface PFAccount {
  id: string;
  staff: StaffOption;
  total_balance: number;
  _count: { transactions: number };
}
interface PFTransaction {
  id: string;
  transaction_type: "CONTRIBUTION" | "WITHDRAWAL";
  amount: number;
  date: string;
  description: string | null;
}
interface PFDetail {
  id: string;
  staff_id: string;
  total_balance: number;
  transactions: PFTransaction[];
}

function fmt(n: number) { return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`; }

export default function PFPage() {
  const qc = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ staff_id: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });

  const { data: accounts, isLoading, isError, error, refetch } = useQuery<PFAccount[]>({
    queryKey: ["hr", "pf"],
    queryFn: async () => (await api.get("/api/hr/pf")).data.data,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<PFDetail>({
    queryKey: ["hr", "pf", selectedStaffId],
    queryFn: async () => (await api.get(`/api/hr/pf/${selectedStaffId}`)).data.data,
    enabled: !!selectedStaffId,
  });

  const withdrawMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/pf/withdraw", {
        staff_id: withdrawForm.staff_id,
        amount: Number(withdrawForm.amount),
        date: withdrawForm.date,
        description: withdrawForm.description || undefined,
      }),
    onSuccess: () => {
      toast.success("Withdrawal processed");
      qc.invalidateQueries({ queryKey: ["hr", "pf"] });
      setShowWithdraw(false);
      setWithdrawForm({ staff_id: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const selected = accounts?.find((a) => a.staff.id === selectedStaffId);

  return (
    <PageWrapper>
      <PageHeader
        title="Provident Fund"
        subtitle="Staff PF balances and transaction history"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Provident Fund" }]}
        action={<Button size="sm" onClick={() => setShowWithdraw(true)}>Process Withdrawal</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: accounts list */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="pt-4 p-0">
              {isLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : isError ? (
                <ErrorState title="Failed" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
              ) : !accounts?.length ? (
                <EmptyState title="No PF accounts" description="PF accounts are created automatically when payroll is finalized with a non-zero PF amount." />
              ) : (
                <div className="divide-y">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedStaffId(a.staff.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${selectedStaffId === a.staff.id ? "bg-accent" : ""}`}
                    >
                      <div className="font-medium text-sm">{a.staff.name_en}</div>
                      <div className="text-xs text-muted-foreground">{a.staff.staff_uid}</div>
                      <div className="text-sm font-semibold text-green-700 mt-1">{fmt(a.total_balance)}</div>
                      <div className="text-xs text-muted-foreground">{a._count.transactions} transactions</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: transaction detail */}
        <div className="lg:col-span-2">
          {!selectedStaffId ? (
            <EmptyState title="Select a staff member" description="Click on a staff member to view their PF transaction history." />
          ) : detailLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : detail ? (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-semibold text-lg">{selected?.staff.name_en}</div>
                    <div className="text-muted-foreground text-sm">{selected?.staff.department?.name_en}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total Balance</div>
                    <div className="text-2xl font-bold text-green-700">{fmt(detail.total_balance)}</div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!detail.transactions.length ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No transactions yet</TableCell></TableRow>
                    ) : detail.transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{new Date(t.date).toLocaleDateString("en-BD")}</TableCell>
                        <TableCell>
                          <Badge variant={t.transaction_type === "CONTRIBUTION" ? "success" : "destructive"}>
                            {t.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{t.description ?? "—"}</TableCell>
                        <TableCell className={`text-right font-medium ${t.transaction_type === "CONTRIBUTION" ? "text-green-700" : "text-red-600"}`}>
                          {t.transaction_type === "WITHDRAWAL" ? "−" : "+"}{fmt(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Withdrawal Dialog */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent>
          <DialogHeader><DialogTitle>Process PF Withdrawal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Staff Member</label>
              <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={withdrawForm.staff_id} onChange={(e) => setWithdrawForm({ ...withdrawForm, staff_id: e.target.value })}>
                <option value="">Select staff...</option>
                {accounts?.map((a) => <option key={a.staff.id} value={a.staff.id}>{a.staff.name_en} — Balance: {fmt(a.total_balance)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Withdrawal Amount (৳)</label>
                <Input type="number" value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={withdrawForm.date} onChange={(e) => setWithdrawForm({ ...withdrawForm, date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input value={withdrawForm.description} onChange={(e) => setWithdrawForm({ ...withdrawForm, description: e.target.value })} placeholder="Retirement, emergency, etc." />
            </div>
            <Button className="w-full" disabled={withdrawMutation.isPending} onClick={() => withdrawMutation.mutate()}>
              {withdrawMutation.isPending ? "Processing..." : "Process Withdrawal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
