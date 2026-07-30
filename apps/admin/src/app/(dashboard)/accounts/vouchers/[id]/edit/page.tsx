"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
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

interface VoucherDetail {
  id: string;
  voucher_no: string;
  voucher_type: string;
  date: string;
  narration: string;
  narration_bn: string | null;
  reference_no: string | null;
  status: string;
  journal_entries: {
    amount: number;
    narration: string | null;
    debit_account: { id: string } | null;
    credit_account: { id: string } | null;
  }[];
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

export default function EditVoucherPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [voucherType, setVoucherType] = useState("RECEIPT");
  const [date, setDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [narration, setNarration] = useState("");
  const [narrationBn, setNarrationBn] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [loaded, setLoaded] = useState(false);

  const { data: voucher } = useQuery<VoucherDetail>({
    queryKey: ["accounts", "vouchers", params.id],
    queryFn: async () => (await api.get(`/api/accounts/vouchers/${params.id}`)).data.data,
  });

  const { data: accounts } = useQuery<AccountOption[]>({
    queryKey: ["accounts", "search", ""],
    queryFn: async () => (await api.get("/api/accounts/search")).data.data,
  });

  // Prefill the form once the voucher loads — only once, so further edits
  // aren't clobbered by react-query refetches.
  useEffect(() => {
    if (!voucher || loaded) return;
    if (voucher.status !== "DRAFT") return;
    setVoucherType(voucher.voucher_type);
    setDate(voucher.date.slice(0, 10));
    setReferenceNo(voucher.reference_no ?? "");
    setNarration(voucher.narration);
    setNarrationBn(voucher.narration_bn ?? "");
    setLines(
      voucher.journal_entries.map((e) => ({
        debit_account_id: e.debit_account?.id ?? "",
        credit_account_id: e.credit_account?.id ?? "",
        amount: String(e.amount),
        narration: e.narration ?? "",
      })),
    );
    setLoaded(true);
  }, [voucher, loaded]);

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_account_id ? Number(l.amount) || 0 : 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_account_id ? Number(l.amount) || 0 : 0), 0);
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference === 0 && totalDebit > 0;

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/accounts/vouchers/${params.id}`, {
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
      toast.success(`Voucher ${res.data.data.voucher_no} updated`);
      router.push(`/accounts/vouchers/${res.data.data.id}`);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update voucher"),
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

  if (!voucher) return null;

  if (voucher.status !== "DRAFT") {
    return (
      <PageWrapper>
        <PageHeader title="Edit Voucher" breadcrumbs={[{ label: "Accounts" }, { label: "Vouchers", href: "/accounts/vouchers" }, { label: voucher.voucher_no }]} />
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Only DRAFT vouchers can be edited — {voucher.voucher_no} is {voucher.status}.
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader title={`Edit ${voucher.voucher_no}`} breadcrumbs={[{ label: "Accounts" }, { label: "Vouchers", href: "/accounts/vouchers" }, { label: voucher.voucher_no, href: `/accounts/vouchers/${voucher.id}` }, { label: "Edit" }]} />

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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Debit Account</TableHead>
                    <TableHead>Credit Account</TableHead>
                    <TableHead>Amount (৳)</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <Select value={line.debit_account_id || "NONE"} onValueChange={(v) => updateLine(index, { debit_account_id: v === "NONE" ? "" : v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">—</SelectItem>
                            {accounts?.map((a) => <SelectItem key={a.id} value={a.id}>({a.code}) {a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={line.credit_account_id || "NONE"} onValueChange={(v) => updateLine(index, { credit_account_id: v === "NONE" ? "" : v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">—</SelectItem>
                            {accounts?.map((a) => <SelectItem key={a.id} value={a.id}>({a.code}) {a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input type="number" value={line.amount} onChange={(e) => updateLine(index, { amount: e.target.value })} className="w-28" /></TableCell>
                      <TableCell><Input value={line.narration} onChange={(e) => updateLine(index, { narration: e.target.value })} className="w-40" /></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeRow(index)} disabled={lines.length === 1}>✕</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            <Button disabled={!isBalanced || !narration || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
