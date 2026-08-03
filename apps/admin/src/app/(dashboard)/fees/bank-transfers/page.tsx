"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, EmptyState, ErrorState, LoadingSpinner, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface PendingTransfer {
  id: string;
  amount: number;
  gateway: string;
  transaction_id: string | null;
  slip_url: string | null;
  created_at: string;
  invoice: {
    description: string;
    // Nullable on both sides -- an admission-applicant's payment has no
    // Student yet (only claimed at enroll time), while every other payment
    // has no AdmissionApplication. Exactly one of the two is ever set.
    student: { name_en: string; student_uid: string } | null;
    application: { applicant_name: string; admission_roll: string } | null;
  };
}

export default function BankTransfersPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<PendingTransfer[]>({
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
      const message = extractErrorMessage(err) ?? "Failed to verify payment";
      toast.error(message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/bank-transfers/${id}/reject`),
    onSuccess: () => {
      toast.success("Payment rejected");
      queryClient.invalidateQueries({ queryKey: ["fees", "bank-transfers", "pending"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reject payment"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Bank Transfer Verification" subtitle="Cross-check each slip against the bank statement before verifying" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Bank Transfers" }]} />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load bank transfers" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!data?.length && <EmptyState title="No pending bank transfers" />}
      <div className="space-y-3">
        {data?.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">
                  {p.invoice.student ? (
                    <>{p.invoice.student.name_en} <span className="text-xs text-muted-foreground">({p.invoice.student.student_uid})</span></>
                  ) : p.invoice.application ? (
                    <>{p.invoice.application.applicant_name} <span className="text-xs text-muted-foreground">(Applicant — Roll {p.invoice.application.admission_roll})</span></>
                  ) : (
                    <span className="text-muted-foreground">Unknown payer</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{p.invoice.description} · ৳{p.amount}</p>
                <p className="text-xs text-muted-foreground">{p.gateway} · Transaction ID: <span className="font-mono">{p.transaction_id ?? "—"}</span></p>
                <p className="text-xs text-muted-foreground">Submitted {new Date(p.created_at).toLocaleDateString()}</p>
                {p.gateway === "BANK_TRANSFER" ? (
                  p.slip_url ? (
                    <a href={p.slip_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View Slip</a>
                  ) : (
                    <p className="text-xs text-amber-600">No slip uploaded yet</p>
                  )
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(p.id)} disabled={rejectMutation.isPending}>Reject</Button>
                <Button size="sm" onClick={() => verifyMutation.mutate(p.id)} disabled={verifyMutation.isPending || (p.gateway === "BANK_TRANSFER" && !p.slip_url)}>Verify</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
        </>
      )}
    </PageWrapper>
  );
}
