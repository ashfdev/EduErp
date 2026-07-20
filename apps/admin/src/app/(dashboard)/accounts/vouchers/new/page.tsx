"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Line {
  debit_account_id: string;
  credit_account_id: string;
  amount: string;
  narration: string;
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  RECEIPT: { label: "Receipt (RV)", color: "border-green-500" },
  PAYMENT: { label: "Payment (PV)", color: "border-red-500" },
  JOURNAL: { label: "Journal (JV)", color: "border-blue-500" },
  CONTRA: { label: "Contra (CV)", color: "border-purple-500" },
};

function emptyLine(): Line {
  return { debit_account_id: "", credit_account_id: "", amount: "", narration: "" };
}

export default function NewVoucherPage() {
  const router = useRouter();
  const [voucherType, setVoucherType] = useState("RECEIPT");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");
  const [narration, setNarration] = useState("");
  const [narrationBn, setNarrationBn] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const { data: accounts } = useQuery<AccountOption[]>({
    queryKey: ["accounts", "search", ""],
    queryFn: async () => (await api.get("/api/accounts/search")).data.data,
  });

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_account_id ? Number(l.amount) || 0 : 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_account_id ? Number(l.amount) || 0 : 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference === 0 && totalDebit > 0;

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/accounts/vouchers", {
        voucher_type: voucherType,
        date,
        reference_no: referenceNo || undefined,
        narration,
        narration_bn: narrationBn || undefined,
        entries: lines.map((l) => ({
          debit_account_id: l.debit_account_id || undefined,
          credit_account_id: l.credit_account_id || undefined,
          amount: Number(l.amount),
          narration: l.narration || undefined,
        })),
      }),
    onSuccess: (res) => {
      toast.success(`Voucher ${res.data.data.voucher_no} created`);
      router.push(`/accounts/vouchers/${res.data.data.id}`);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create voucher"),
  });

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addRow() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeRow(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <PageWrapper>
      <PageHeader title="New Voucher" breadcrumbs={[{ label: "Accounts" }, { label: "Vouchers" }, { label: "New" }]} />

      <Card className={`border-l-4 ${TYPE_META[voucherType]?.color}`}>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Voucher Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_META).map(([key, meta]) => <SelectItem key={key} value={key}>{meta.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reference No (optional)</Label>
              <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Cheque no, invoice no…" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Narration (English)</Label>
              <Textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Narration (বাংলা)</Label>
              <Textarea value={narrationBn} onChange={(e) => setNarrationBn(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Journal Entries</Label>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">#</th>
                    <th className="p-2">Debit Account</th>
                    <th className="p-2">Credit Account</th>
                    <th className="p-2">Amount (৳)</th>
                    <th className="p-2">Narration</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="p-2 text-muted-foreground">{index + 1}</td>
                      <td className="p-2">
                        <Select value={line.debit_account_id || "NONE"} onValueChange={(v) => updateLine(index, { debit_account_id: v === "NONE" ? "" : v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">—</SelectItem>
                            {accounts?.map((a) => <SelectItem key={a.id} value={a.id}>({a.code}) {a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select value={line.credit_account_id || "NONE"} onValueChange={(v) => updateLine(index, { credit_account_id: v === "NONE" ? "" : v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">—</SelectItem>
                            {accounts?.map((a) => <SelectItem key={a.id} value={a.id}>({a.code}) {a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2"><Input type="number" value={line.amount} onChange={(e) => updateLine(index, { amount: e.target.value })} className="w-28" /></td>
                      <td className="p-2"><Input value={line.narration} onChange={(e) => updateLine(index, { narration: e.target.value })} className="w-40" /></td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => removeRow(index)} disabled={lines.length === 1}>✕</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="outline" onClick={addRow}>+ Add Row</Button>
          </div>

          <div className={`flex items-center justify-between rounded-md border p-3 ${isBalanced ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}`}>
            <div className="flex gap-6 text-sm">
              <span>Total Debit: <strong>৳{totalDebit.toLocaleString()}</strong></span>
              <span>Total Credit: <strong>৳{totalCredit.toLocaleString()}</strong></span>
              <span>Difference: <strong>৳{Math.abs(difference).toLocaleString()}</strong></span>
            </div>
            <span className={isBalanced ? "font-medium text-green-700" : "font-medium text-red-700"}>{isBalanced ? "✅ Balanced" : "⚠️ Unbalanced"}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button disabled={!isBalanced || !narration || createMutation.isPending} onClick={() => createMutation.mutate()}>
              Save as Draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
