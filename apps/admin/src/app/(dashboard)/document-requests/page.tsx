"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Badge,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  ErrorState,
  LoadingSpinner,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface RequestRow {
  id: string;
  doc_type: "TESTIMONIAL" | "TRANSFER_CERTIFICATE";
  reason: string | null;
  created_at: string;
  student: {
    id: string;
    name_en: string;
    student_uid: string;
    cgpa: number | null;
    current_class: { name_en: string } | null;
    current_section: { name: string } | null;
  };
  context: {
    outstanding_due: number;
    latest_result_published: boolean;
  };
}

const DOC_TYPE_LABEL: Record<string, string> = { TESTIMONIAL: "Testimonial", TRANSFER_CERTIFICATE: "Transfer Certificate" };

export default function DocumentRequestsQueuePage() {
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: requests, isLoading, isError, error, refetch } = useQuery<RequestRow[]>({
    queryKey: ["documents", "requests"],
    queryFn: async () => (await api.get("/api/documents/requests")).data.data,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/documents/requests/${id}/approve`),
    onSuccess: () => {
      toast.success("Request approved — document generated");
      queryClient.invalidateQueries({ queryKey: ["documents", "requests"] });
    },
    onError: () => toast.error("Failed to approve request"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.put(`/api/documents/requests/${rejectId}/reject`, { rejection_reason: rejectionReason }),
    onSuccess: () => {
      toast.success("Request rejected");
      queryClient.invalidateQueries({ queryKey: ["documents", "requests"] });
      setRejectId(null);
      setRejectionReason("");
    },
    onError: () => toast.error("Failed to reject request"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Document Requests"
        subtitle="Student/guardian requests for TC, Testimonial, and other sensitive documents"
        breadcrumbs={[{ label: "Document Requests" }]}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load document requests" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!requests?.length && <EmptyState title="No pending requests" />}

          <div className="space-y-3">
            {requests?.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-2 pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {r.student.name_en} <span className="font-mono text-xs text-muted-foreground">{r.student.student_uid}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {r.student.current_class?.name_en} {r.student.current_section && `· ${r.student.current_section.name}`}
                      </p>
                    </div>
                    <Badge variant="outline">{DOC_TYPE_LABEL[r.doc_type]}</Badge>
                  </div>
                  {r.reason && <p className="text-sm">Reason: {r.reason}</p>}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant={r.context.outstanding_due > 0 ? "destructive" : "default"}>
                      {r.context.outstanding_due > 0 ? `৳${r.context.outstanding_due.toFixed(2)} due` : "No dues"}
                    </Badge>
                    <Badge variant={r.context.latest_result_published ? "default" : "outline"}>
                      {r.context.latest_result_published ? "Result published" : "No published result"}
                    </Badge>
                    {r.student.cgpa != null && <Badge variant="outline">CGPA {r.student.cgpa.toFixed(2)}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleDateString()}</p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => approveMutation.mutate(r.id)} disabled={approveMutation.isPending}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectId(r.id)}>Reject</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Document Request</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (shown to the student/guardian)</Label>
            <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g. Outstanding fee dues" />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || !rejectionReason}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
