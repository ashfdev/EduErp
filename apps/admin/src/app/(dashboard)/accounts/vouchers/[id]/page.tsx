"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, PageHeader, PageWrapper, StatusBadge, extractErrorMessage } from "@education-erp/ui";
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
  journal_entries: JournalEntry[];
}

export default function VoucherDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

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

  if (!voucher) return null;

  return (
    <PageWrapper>
      <PageHeader
        title={voucher.voucher_no}
        subtitle={voucher.narration}
        breadcrumbs={[{ label: "Accounts" }, { label: "Vouchers", href: "/accounts/vouchers" }, { label: voucher.voucher_no }]}
        action={
          <div className="flex gap-2">
            {voucher.status === "DRAFT" && <Button size="sm" onClick={() => actionMutation.mutate("approve")}>Approve</Button>}
            {voucher.status === "APPROVED" && <Button size="sm" onClick={() => actionMutation.mutate("post")}>Post</Button>}
            {voucher.status !== "POSTED" && voucher.status !== "CANCELLED" && (
              <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("cancel")}>Cancel</Button>
            )}
          </div>
        }
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

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2">Debit Account</th>
                  <th className="p-2">Credit Account</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Narration</th>
                </tr>
              </thead>
              <tbody>
                {voucher.journal_entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="p-2">{e.debit_account ? `(${e.debit_account.code}) ${e.debit_account.name}` : "—"}</td>
                    <td className="p-2">{e.credit_account ? `(${e.credit_account.code}) ${e.credit_account.name}` : "—"}</td>
                    <td className="p-2">৳{e.amount.toLocaleString()}</td>
                    <td className="p-2">{e.narration ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="p-2" colSpan={2}>Total</td>
                  <td className="p-2">৳{voucher.total_amount.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
