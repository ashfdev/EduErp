"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Label, PageHeader, PageWrapper, StatusBadge, Textarea, Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface JournalEntry {
  id: string;
  amount: number;
  narration: string | null;
  debit_account: { code: string; name: string } | null;
  credit_account: { code: string; name: string } | null;
}

interface VoucherDetail {
  id: string;
  voucher_no: string;
  voucher_type: string;
  date: string;
  narration: string;
  narration_bn: string | null;
  reference_no: string | null;
  total_amount: number;
  status: string;
  is_auto: boolean;
  reversed_by_voucher_id: string | null;
  journal_entries: JournalEntry[];
}

export default function VoucherDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: voucher } = useQuery<VoucherDetail>({
    queryKey: ["accounts", "vouchers", params.id],
    queryFn: async () => (await api.get(`/api/accounts/vouchers/${params.id}`)).data.data,
  });

  const actionMutation = useMutation({
    mutationFn: (action: "approve" | "post" | "cancel") => api.post(`/api/accounts/vouchers/${params.id}/${action}`),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["accounts", "vouchers", params.id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Action failed"),
  });

  const reverseMutation = useMutation({
    mutationFn: () => api.post(`/api/accounts/vouchers/${params.id}/reverse`, { reason: reverseReason || undefined }),
    onSuccess: (res) => {
      toast.success(`Reversed — new voucher ${res.data.data.voucher_no} posted`);
      queryClient.invalidateQueries({ queryKey: ["accounts", "vouchers", params.id] });
      setReverseOpen(false);
      setReverseReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Reversal failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/accounts/vouchers/${params.id}`),
    onSuccess: () => {
      toast.success("Voucher deleted");
      router.push("/accounts/vouchers");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to delete voucher"),
  });

  if (!voucher) return null;

  return (
    <PageWrapper>
      <PageHeader
        title={voucher.voucher_no}
        subtitle={voucher.narration}
        breadcrumbs={[{ label: "Accounts" }, { label: "Vouchers", href: "/accounts/vouchers" }, { label: voucher.voucher_no }]}
        action={
          <div className="flex gap-2">
            {voucher.status === "DRAFT" && (
              <Link href={`/accounts/vouchers/${voucher.id}/edit`}>
                <Button size="sm" variant="outline">Edit</Button>
              </Link>
            )}
            {voucher.status === "DRAFT" && <Button size="sm" onClick={() => actionMutation.mutate("approve")}>Approve</Button>}
            {voucher.status === "APPROVED" && <Button size="sm" onClick={() => actionMutation.mutate("post")}>Post</Button>}
            {voucher.status !== "POSTED" && voucher.status !== "CANCELLED" && (
              <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("cancel")}>Cancel</Button>
            )}
            {voucher.status === "DRAFT" && (
              <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>Delete</Button>
            )}
            {voucher.status === "POSTED" && !voucher.reversed_by_voucher_id && (
              <Button size="sm" variant="destructive" onClick={() => setReverseOpen(true)}>Reverse (Correct a Mistake)</Button>
            )}
          </div>
        }
      />

      {voucher.reversed_by_voucher_id && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This voucher has been reversed —{" "}
          <Link href={`/accounts/vouchers/${voucher.reversed_by_voucher_id}`} className="underline">
            view the correcting voucher
          </Link>
          .
        </p>
      )}

      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reverse {voucher.voucher_no}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This posts a new voucher with every debit/credit line flipped, correcting this entry without editing or
            deleting it (the original stays on record). This cannot be undone from here.
          </p>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => reverseMutation.mutate()} disabled={reverseMutation.isPending}>
              {reverseMutation.isPending ? "Reversing..." : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete voucher"
        description={`Delete voucher ${voucher.voucher_no}? This cannot be undone.`}
        destructive
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteMutation.mutate();
        }}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><p className="text-muted-foreground">Type</p><p>{voucher.voucher_type}</p></div>
            <div><p className="text-muted-foreground">Date</p><p>{new Date(voucher.date).toLocaleDateString()}</p></div>
            <div><p className="text-muted-foreground">Status</p><StatusBadge status={voucher.status} /></div>
            <div><p className="text-muted-foreground">Reference</p><p>{voucher.reference_no ?? "—"}{voucher.is_auto && " (auto)"}</p></div>
          </div>

          {voucher.narration_bn && <p className="text-sm"><span className="text-muted-foreground">বাংলা: </span>{voucher.narration_bn}</p>}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Debit Account</TableHead>
                  <TableHead>Credit Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Narration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {voucher.journal_entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.debit_account ? `(${e.debit_account.code}) ${e.debit_account.name}` : "—"}</TableCell>
                    <TableCell>{e.credit_account ? `(${e.credit_account.code}) ${e.credit_account.name}` : "—"}</TableCell>
                    <TableCell>৳{e.amount.toLocaleString()}</TableCell>
                    <TableCell>{e.narration ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell>৳{voucher.total_amount.toLocaleString()}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
