"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, Input, Label, LoadingSpinner, StatusBadge, extractErrorMessage } from "@education-erp/ui";

interface ApprovalRow {
  id: string;
  status: string;
  teacher: { name_en: string };
}
interface LeaveRequestRow {
  id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  approvals: ApprovalRow[];
}

function LeaveContent() {
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<LeaveRequestRow[]>({
    queryKey: ["portal", "leave-requests", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/leave-requests`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/student/${activeStudentId}/leave-requests`, { from_date: fromDate, to_date: toDate, reason }),
    onSuccess: () => {
      toast.success("Leave request submitted");
      queryClient.invalidateQueries({ queryKey: ["portal", "leave-requests", activeStudentId] });
      setOpen(false);
      setFromDate(""); setToDate(""); setReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to submit leave request"),
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title="Couldn't load leave requests" description="Please try again." retryLabel="Retry" onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6 lg:space-y-8 max-w-3xl mx-auto w-full lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leave Requests</h1>
        <Button onClick={() => setOpen(true)}>+ Request Leave</Button>
      </div>

      {!data?.length && <EmptyState title="No leave requests yet" description="Submit one when the student needs to be away from school." />}

      <div className="space-y-3">
        {data?.map((r) => (
          <Card key={r.id} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-800">
                    {new Date(r.from_date).toLocaleDateString()} – {new Date(r.to_date).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{r.reason}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.status === "REJECTED" && r.rejection_reason && (
                <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Reason: {r.rejection_reason}</p>
              )}
              {!!r.approvals.length && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {r.approvals.filter((a) => a.status === "APPROVED").length} of {r.approvals.length} teachers approved
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {r.approvals.map((a) => (
                      <Badge key={a.id} variant={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "destructive" : "outline"}>
                        {a.teacher.name_en}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function" /></div>
          </div>
          <DialogFooter>
            <Button disabled={!fromDate || !toDate || !reason || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              {submitMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LeavePage() {
  return (
    <PortalShell>
      <LeaveContent />
    </PortalShell>
  );
}
