"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, Textarea, StatusBadge, EmptyState, Tabs, TabsList, TabsTrigger, TabsContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface CorrectionRow {
  id: string;
  exam_id: string;
  exam_name: string;
  class_id: string;
  section_id: string | null;
  subject_id: string;
  subject_name: string;
  teacher_id: string;
  teacher_name: string;
  reason: string;
  status: string;
  expires_at: string | null;
  decision_note: string | null;
  created_at: string;
}

function PendingTab() {
  const queryClient = useQueryClient();
  const { data } = useQuery<CorrectionRow[]>({
    queryKey: ["mark-corrections", "pending"],
    queryFn: async () => (await api.get("/api/mark-corrections/pending")).data.data,
  });

  const [approveTarget, setApproveTarget] = useState<CorrectionRow | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const approveMutation = useMutation({
    mutationFn: () => api.put(`/api/mark-corrections/${approveTarget!.id}/approve`, { expires_at: expiresAt || undefined, decision_note: approveNote || undefined }),
    onSuccess: () => {
      toast.success("Correction request approved");
      setApproveTarget(null);
      setExpiresAt("");
      setApproveNote("");
      queryClient.invalidateQueries({ queryKey: ["mark-corrections"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to approve"),
  });

  const [rejectTarget, setRejectTarget] = useState<CorrectionRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const rejectMutation = useMutation({
    mutationFn: () => api.put(`/api/mark-corrections/${rejectTarget!.id}/reject`, { decision_note: rejectNote }),
    onSuccess: () => {
      toast.success("Correction request rejected");
      setRejectTarget(null);
      setRejectNote("");
      queryClient.invalidateQueries({ queryKey: ["mark-corrections"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reject"),
  });

  if (!data?.length) return <EmptyState title="No pending correction requests" />;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Requested</TableHead><TableHead>Teacher</TableHead><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Reason</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{r.teacher_name}</TableCell>
                  <TableCell>{r.exam_name}</TableCell>
                  <TableCell>{r.subject_name}{r.section_id ? "" : " (whole class)"}</TableCell>
                  <TableCell className="max-w-xs truncate" title={r.reason}>{r.reason}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setApproveTarget(r)}>Approve</Button>{" "}
                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(r)}>Reject</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={approveTarget !== null} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve correction — {approveTarget?.subject_name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {approveTarget?.teacher_name} will be able to re-enter marks for this subject
            {approveTarget?.section_id ? "" : " across the whole class"} until it&apos;s revoked or the expiry below passes.
          </p>
          <div className="space-y-1.5">
            <Label>Expires At (optional — leave blank for no expiry)</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={approveNote} onChange={(e) => setApproveNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject correction — {rejectTarget?.subject_name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || !rejectNote.trim()}>
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AllRequestsTab() {
  const queryClient = useQueryClient();
  const { data } = useQuery<CorrectionRow[]>({
    queryKey: ["mark-corrections", "all"],
    queryFn: async () => (await api.get("/api/mark-corrections")).data.data,
  });
  const [revokeTarget, setRevokeTarget] = useState<CorrectionRow | null>(null);
  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/mark-corrections/${id}/revoke`, {}),
    onSuccess: () => {
      toast.success("Correction revoked");
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["mark-corrections"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to revoke"),
  });

  if (!data?.length) return <EmptyState title="No requests" />;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Teacher</TableHead><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Expires</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.teacher_name}</TableCell>
                  <TableCell>{r.exam_name}</TableCell>
                  <TableCell>{r.subject_name}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{r.expires_at ? new Date(r.expires_at).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    {r.status === "APPROVED" && (
                      <Button size="sm" variant="destructive" onClick={() => setRevokeTarget(r)}>Revoke</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke this correction?"
        description={revokeTarget ? `${revokeTarget.teacher_name} will immediately lose the ability to re-enter marks for ${revokeTarget.subject_name}.` : undefined}
        confirmLabel="Revoke"
        destructive
        loading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
      />
    </>
  );
}

export default function MarkCorrectionsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Mark Correction Requests"
        subtitle="Per-teacher, per-subject requests to re-open marks after an exam is completed"
        breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: "Mark Corrections" }]}
      />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="all">Approved / Revoked</TabsTrigger>
        </TabsList>
        <TabsContent value="pending"><PendingTab /></TabsContent>
        <TabsContent value="all"><AllRequestsTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
