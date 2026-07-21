"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface JournalFailure {
  id: string;
  reference_type: string;
  reference_id: string | null;
  error_message: string;
  resolved_at: string | null;
  created_at: string;
}

export default function JournalFailuresPage() {
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const { data: failures } = useQuery<JournalFailure[]>({
    queryKey: ["accounts", "journal-failures", showResolved],
    queryFn: async () => (await api.get("/api/accounts/journal-failures", { params: { resolved: showResolved ? "true" : "false" } })).data.data,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/accounts/journal-failures/${id}/resolve`, {}),
    onSuccess: () => {
      toast.success("Marked resolved");
      queryClient.invalidateQueries({ queryKey: ["accounts", "journal-failures"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to resolve"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Journal Posting Failures"
        subtitle="Money movements whose accounting entry failed to post — the payment/payroll/purchase still went through, but the books are out of sync until this is fixed."
        breadcrumbs={[{ label: "Accounts", href: "/accounts" }, { label: "Journal Failures" }]}
        action={
          <Button variant="outline" size="sm" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Show Unresolved" : "Show Resolved"}
          </Button>
        }
      />

      {!failures?.length && (
        <EmptyState
          title={showResolved ? "No resolved failures yet" : "No unresolved failures"}
          description={showResolved ? undefined : "Every recent money movement's accounting entry posted successfully."}
        />
      )}

      {!!failures?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">When</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Reference ID</th>
                  <th className="p-2">Error</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="p-2 whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="p-2"><Badge variant="outline">{f.reference_type}</Badge></td>
                    <td className="p-2 font-mono text-xs">{f.reference_id ?? "—"}</td>
                    <td className="p-2 text-destructive">{f.error_message}</td>
                    <td className="p-2 text-right">
                      {!f.resolved_at && (
                        <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(f.id)} disabled={resolveMutation.isPending}>
                          Mark Resolved
                        </Button>
                      )}
                      {f.resolved_at && <Badge variant="success">Resolved</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
