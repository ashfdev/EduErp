"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface PendingTransfer {
  id: string;
  amount: number;
  transaction_id: string | null;
  receipt_url: string | null;
  created_at: string;
  invoice: { description: string; student: { name_en: string; student_uid: string } };
}

export default function BankTransfersPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery<PendingTransfer[]>({
    queryKey: ["fees", "bank-transfers", "pending"],
    queryFn: async () => (await api.get("/api/payments/bank-transfers/pending")).data.data,
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/bank-transfers/${id}/verify`),
    onSuccess: () => {
      toast.success("Payment verified and posted");
      queryClient.invalidateQueries({ queryKey: ["fees", "bank-transfers", "pending"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to verify payment";
      toast.error(message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/bank-transfers/${id}/reject`),
    onSuccess: () => {
      toast.success("Payment rejected");
      queryClient.invalidateQueries({ queryKey: ["fees", "bank-transfers", "pending"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Bank Transfer Verification" subtitle="Cross-check each slip against the bank statement before verifying" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Bank Transfers" }]} />

      {!data?.length && <EmptyState title="No pending bank transfers" />}
      <div className="space-y-3">
        {data?.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{p.invoice.student.name_en} <span className="text-xs text-muted-foreground">({p.invoice.student.student_uid})</span></p>
                <p className="text-sm text-muted-foreground">{p.invoice.description} · ৳{p.amount}</p>
                <p className="text-xs text-muted-foreground">Submitted {new Date(p.created_at).toLocaleDateString()}</p>
                {p.receipt_url ? (
                  <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View Slip</a>
                ) : (
                  <p className="text-xs text-amber-600">No slip uploaded yet</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(p.id)} disabled={rejectMutation.isPending}>Reject</Button>
                <Button size="sm" onClick={() => verifyMutation.mutate(p.id)} disabled={verifyMutation.isPending || !p.receipt_url}>Verify</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageWrapper>
  );
}
