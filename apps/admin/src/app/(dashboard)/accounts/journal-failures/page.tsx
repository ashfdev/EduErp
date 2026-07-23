"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
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
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference ID</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{f.reference_type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{f.reference_id ?? "—"}</TableCell>
                    <TableCell className="text-destructive">{f.error_message}</TableCell>
                    <TableCell className="text-right">
                      {!f.resolved_at && (
                        <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(f.id)} disabled={resolveMutation.isPending}>
                          Mark Resolved
                        </Button>
                      )}
                      {f.resolved_at && <Badge variant="success">Resolved</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
