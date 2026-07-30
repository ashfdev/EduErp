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
  Label,
  Textarea,
  Badge,
  StatusBadge,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  extractErrorMessage,
  ErrorState,
  LoadingSpinner,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentRef {
  id: string;
  name_en: string;
  student_uid: string;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
}
interface ApprovalRow {
  id: string;
  status: string;
  teacher: { name_en: string };
}
interface RequestRow {
  id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  student: StudentRef;
  approvals: ApprovalRow[];
}

export default function StudentLeaveOversightPage() {
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<{ kind: "request" | "approval"; id: string } | null>(null);
  const [reason, setReason] = useState("");

  const { data: requests, isLoading, isError, error, refetch } = useQuery<RequestRow[]>({
    queryKey: ["student-leave", "requests"],
    queryFn: async () => (await api.get("/api/student-leave/requests")).data.data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["student-leave", "requests"] });

  const approveRequestMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/student-leave/requests/${id}/approve`),
    onSuccess: () => { toast.success("Leave request approved"); invalidate(); },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Action failed"),
  });

  const approveApprovalMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/student-leave/approvals/${id}/approve`),
    onSuccess: () => { toast.success("Approval recorded"); invalidate(); },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Action failed"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!rejectTarget) return Promise.reject(new Error("No leave request selected"));
      const path = rejectTarget.kind === "request" ? `/api/student-leave/requests/${rejectTarget.id}/reject` : `/api/student-leave/approvals/${rejectTarget.id}/reject`;
      return api.put(path, { reason });
    },
    onSuccess: () => {
      toast.success("Leave request rejected");
      setRejectTarget(null);
      setReason("");
      invalidate();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Action failed"),
  });

  const pending = requests?.filter((r) => r.status === "PENDING" || r.status === "PARTIALLY_APPROVED") ?? [];
  const decided = requests?.filter((r) => r.status === "APPROVED" || r.status === "REJECTED") ?? [];

  function RequestCard({ r }: { r: RequestRow }) {
    const isModeB = r.approvals.length > 0;
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">
                {r.student.name_en} <span className="font-mono text-xs text-muted-foreground">{r.student.student_uid}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {r.student.current_class?.name_en} {r.student.current_section && `· ${r.student.current_section.name}`}
              </p>
              <p className="text-sm">
                {new Date(r.from_date).toLocaleDateString()} – {new Date(r.to_date).toLocaleDateString()}
              </p>
              <p className="text-sm">{r.reason}</p>
            </div>
            <StatusBadge status={r.status} />
          </div>

          {r.status === "REJECTED" && r.rejection_reason && (
            <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">Reason: {r.rejection_reason}</p>
          )}

          {isModeB ? (
            <div className="flex flex-wrap gap-2">
              {r.approvals.map((a) => (
                <Badge key={a.id} variant={a.status === "APPROVED" ? "default" : a.status === "REJECTED" ? "destructive" : "outline"}>
                  {a.teacher.name_en}: {a.status}
                </Badge>
              ))}
            </div>
          ) : (
            <Badge variant="outline">Class Teacher approval</Badge>
          )}

          {(r.status === "PENDING" || r.status === "PARTIALLY_APPROVED") && (
            <div className="flex gap-2 pt-1">
              {isModeB ? (
                r.approvals.filter((a) => a.status === "PENDING").map((a) => (
                  <div key={a.id} className="flex gap-2">
                    <Button size="sm" onClick={() => approveApprovalMutation.mutate(a.id)} disabled={approveApprovalMutation.isPending}>
                      Approve as {a.teacher.name_en}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setRejectTarget({ kind: "approval", id: a.id }); setReason(""); }}>
                      Reject
                    </Button>
                  </div>
                ))
              ) : (
                <>
                  <Button size="sm" onClick={() => approveRequestMutation.mutate(r.id)} disabled={approveRequestMutation.isPending}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { setRejectTarget({ kind: "request", id: r.id }); setReason(""); }}>
                    Reject
                  </Button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleDateString()}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Student Leave Requests"
        subtitle="Oversight of all student leave requests — Class Teacher and Subject Teacher approval modes"
        breadcrumbs={[{ label: "Student Leave Requests" }]}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load leave requests" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            {!pending.length && <EmptyState title="No pending leave requests" />}
            <div className="space-y-3">
              {pending.map((r) => <RequestCard key={r.id} r={r} />)}
            </div>
          </TabsContent>
          <TabsContent value="decided">
            {!decided.length && <EmptyState title="No decided leave requests yet" />}
            <div className="space-y-3">
              {decided.map((r) => <RequestCard key={r.id} r={r} />)}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (shown to the requester)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || !reason.trim()}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
