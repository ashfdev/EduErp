"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@education-erp/ui";
import { api } from "@/lib/api";

type ReqStatus = "PENDING" | "APPROVED" | "REJECTED";

interface StudentSummary {
  id: string;
  name_en: string;
  student_uid: string;
  current_class: { name_en: string } | null;
  current_section: { name: string } | null;
}
interface TransportRequestRow {
  id: string;
  student: StudentSummary;
  route: { name: string; fare: number };
  pickup_stop: string | null;
  reason: string | null;
  status: ReqStatus;
  rejection_reason: string | null;
  created_at: string;
}
interface HostelRequestRow {
  id: string;
  student: StudentSummary;
  room: { room_no: string; capacity: number; block: { name: string } };
  reason: string | null;
  status: ReqStatus;
  rejection_reason: string | null;
  created_at: string;
}
interface FeeStructureOption {
  id: string;
  name: string;
  amount: number;
  category: string;
  is_active: boolean;
}

function statusBadge(status: ReqStatus) {
  return <Badge variant={status === "APPROVED" ? "default" : status === "REJECTED" ? "destructive" : "outline"}>{status}</Badge>;
}

export default function FacilityRequestsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  // Real gap found and fixed 2026-08-08: the "New transport/hostel request"
  // notification's link pointed at /transport/requests and /hostel/requests,
  // neither of which is a real route -- this page (a single combined view
  // with a tab switcher) is the actual destination. Reading ?tab= here lets
  // that link land directly on the right tab instead of always defaulting to
  // Transport regardless of which request type triggered the notification.
  const initialTab = searchParams.get("tab") === "hostel" ? "hostel" : "transport";
  const [statusFilter, setStatusFilter] = useState<ReqStatus | "">("PENDING");

  const { data: structures } = useQuery<FeeStructureOption[]>({
    queryKey: ["fees", "structures"],
    queryFn: async () => (await api.get("/api/fees/structures")).data.data,
  });
  const transportStructures = structures?.filter((s) => s.category === "TRANSPORT" && s.is_active) ?? [];
  const hostelStructures = structures?.filter((s) => s.category === "HOSTEL" && s.is_active) ?? [];

  const { data: transportRequests, isLoading: transportLoading, isError: transportError, error: transportErrorObj, refetch: refetchTransport } = useQuery<TransportRequestRow[]>({
    queryKey: ["transport", "requests", statusFilter],
    queryFn: async () => (await api.get("/api/transport/requests", { params: { status: statusFilter || undefined } })).data.data,
  });
  const { data: hostelRequests, isLoading: hostelLoading, isError: hostelError, error: hostelErrorObj, refetch: refetchHostel } = useQuery<HostelRequestRow[]>({
    queryKey: ["hostel", "requests", statusFilter],
    queryFn: async () => (await api.get("/api/hostel/requests", { params: { status: statusFilter || undefined } })).data.data,
  });

  const [approveTransportTarget, setApproveTransportTarget] = useState<TransportRequestRow | null>(null);
  const [approveTransportFeeId, setApproveTransportFeeId] = useState("");
  const [rejectTransportTarget, setRejectTransportTarget] = useState<TransportRequestRow | null>(null);
  const [rejectTransportReason, setRejectTransportReason] = useState("");

  const [approveHostelTarget, setApproveHostelTarget] = useState<HostelRequestRow | null>(null);
  const [approveHostelFeeId, setApproveHostelFeeId] = useState("");
  const [rejectHostelTarget, setRejectHostelTarget] = useState<HostelRequestRow | null>(null);
  const [rejectHostelReason, setRejectHostelReason] = useState("");

  const approveTransportMutation = useMutation({
    mutationFn: () => api.put(`/api/transport/requests/${approveTransportTarget!.id}/approve`, { fee_structure_id: approveTransportFeeId || undefined }),
    onSuccess: () => {
      toast.success("Transport request approved");
      queryClient.invalidateQueries({ queryKey: ["transport", "requests"] });
      setApproveTransportTarget(null);
      setApproveTransportFeeId("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to approve request"),
  });
  const rejectTransportMutation = useMutation({
    mutationFn: () => api.put(`/api/transport/requests/${rejectTransportTarget!.id}/reject`, { rejection_reason: rejectTransportReason }),
    onSuccess: () => {
      toast.success("Transport request rejected");
      queryClient.invalidateQueries({ queryKey: ["transport", "requests"] });
      setRejectTransportTarget(null);
      setRejectTransportReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reject request"),
  });

  const approveHostelMutation = useMutation({
    mutationFn: () => api.put(`/api/hostel/requests/${approveHostelTarget!.id}/approve`, { fee_structure_id: approveHostelFeeId || undefined }),
    onSuccess: () => {
      toast.success("Hostel request approved");
      queryClient.invalidateQueries({ queryKey: ["hostel", "requests"] });
      setApproveHostelTarget(null);
      setApproveHostelFeeId("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to approve request"),
  });
  const rejectHostelMutation = useMutation({
    mutationFn: () => api.put(`/api/hostel/requests/${rejectHostelTarget!.id}/reject`, { rejection_reason: rejectHostelReason }),
    onSuccess: () => {
      toast.success("Hostel request rejected");
      queryClient.invalidateQueries({ queryKey: ["hostel", "requests"] });
      setRejectHostelTarget(null);
      setRejectHostelReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reject request"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Facility Requests"
        subtitle="Student-submitted Transport and Hostel requests"
        breadcrumbs={[{ label: "Facility Requests" }]}
        action={
          <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : (v as ReqStatus))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="transport">Transport</TabsTrigger>
          <TabsTrigger value="hostel">Hostel</TabsTrigger>
        </TabsList>

        <TabsContent value="transport">
          <Card>
            <CardContent className="pt-4">
              {transportLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : transportError ? (
                <ErrorState title="Failed to load transport requests" description={extractErrorMessage(transportErrorObj)} retryLabel="Retry" onRetry={() => refetchTransport()} />
              ) : !transportRequests?.length ? (
                <EmptyState title="No requests" description="No transport requests match this filter." />
              ) : (
                <div className="space-y-3">
                  {transportRequests.map((r) => (
                    <Card key={r.id} className="border">
                      <CardContent className="space-y-2 pt-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {r.student.name_en} <span className="font-mono text-xs text-muted-foreground">{r.student.student_uid}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {r.student.current_class?.name_en} {r.student.current_section && `· ${r.student.current_section.name}`}
                            </p>
                          </div>
                          {statusBadge(r.status)}
                        </div>
                        <p className="text-sm">Route: <span className="font-medium">{r.route.name}</span> (৳{r.route.fare}){r.pickup_stop && ` · Pickup: ${r.pickup_stop}`}</p>
                        {r.reason && <p className="text-sm text-muted-foreground">&ldquo;{r.reason}&rdquo;</p>}
                        {r.status === "REJECTED" && r.rejection_reason && <p className="text-sm text-destructive">Reason: {r.rejection_reason}</p>}
                        <p className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleDateString()}</p>
                        {r.status === "PENDING" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => { setApproveTransportTarget(r); setApproveTransportFeeId(""); }}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => setRejectTransportTarget(r)}>Reject</Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hostel">
          <Card>
            <CardContent className="pt-4">
              {hostelLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : hostelError ? (
                <ErrorState title="Failed to load hostel requests" description={extractErrorMessage(hostelErrorObj)} retryLabel="Retry" onRetry={() => refetchHostel()} />
              ) : !hostelRequests?.length ? (
                <EmptyState title="No requests" description="No hostel requests match this filter." />
              ) : (
                <div className="space-y-3">
                  {hostelRequests.map((r) => (
                    <Card key={r.id} className="border">
                      <CardContent className="space-y-2 pt-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {r.student.name_en} <span className="font-mono text-xs text-muted-foreground">{r.student.student_uid}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {r.student.current_class?.name_en} {r.student.current_section && `· ${r.student.current_section.name}`}
                            </p>
                          </div>
                          {statusBadge(r.status)}
                        </div>
                        <p className="text-sm">Room: <span className="font-medium">{r.room.block.name} — {r.room.room_no}</span></p>
                        {r.reason && <p className="text-sm text-muted-foreground">&ldquo;{r.reason}&rdquo;</p>}
                        {r.status === "REJECTED" && r.rejection_reason && <p className="text-sm text-destructive">Reason: {r.rejection_reason}</p>}
                        <p className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleDateString()}</p>
                        {r.status === "PENDING" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => { setApproveHostelTarget(r); setApproveHostelFeeId(""); }}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => setRejectHostelTarget(r)}>Reject</Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transport approve/reject */}
      <Dialog open={!!approveTransportTarget} onOpenChange={(v) => { if (!v) { setApproveTransportTarget(null); setApproveTransportFeeId(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => approveTransportFeeId !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => approveTransportFeeId !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Approve Transport Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {approveTransportTarget && (
              <p className="text-sm text-muted-foreground">
                {approveTransportTarget.student.name_en} ({approveTransportTarget.student.student_uid}) — {approveTransportTarget.route.name}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Recurring Fee Structure (optional — leave blank for no recurring fee)</Label>
              <Select value={approveTransportFeeId || "NONE"} onValueChange={(v) => setApproveTransportFeeId(v === "NONE" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No recurring fee</SelectItem>
                  {transportStructures.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} (৳{s.amount})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!transportStructures.length && (
                <p className="text-xs text-muted-foreground">No active TRANSPORT-category fee structures exist yet — set one up under Fee Structures to attach a recurring fee.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button disabled={approveTransportMutation.isPending} onClick={() => approveTransportMutation.mutate()}>
              {approveTransportMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTransportTarget} onOpenChange={(v) => { if (!v) { setRejectTransportTarget(null); setRejectTransportReason(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => rejectTransportReason !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => rejectTransportReason !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Reject Transport Request</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (shown to the student/guardian)</Label>
            <Input value={rejectTransportReason} onChange={(e) => setRejectTransportReason(e.target.value)} placeholder="e.g. Route is full for this term" />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => rejectTransportMutation.mutate()} disabled={rejectTransportMutation.isPending || !rejectTransportReason}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hostel approve/reject */}
      <Dialog open={!!approveHostelTarget} onOpenChange={(v) => { if (!v) { setApproveHostelTarget(null); setApproveHostelFeeId(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => approveHostelFeeId !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => approveHostelFeeId !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Approve Hostel Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {approveHostelTarget && (
              <p className="text-sm text-muted-foreground">
                {approveHostelTarget.student.name_en} ({approveHostelTarget.student.student_uid}) — {approveHostelTarget.room.block.name} — {approveHostelTarget.room.room_no}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Recurring Fee Structure (optional — leave blank for no recurring fee)</Label>
              <Select value={approveHostelFeeId || "NONE"} onValueChange={(v) => setApproveHostelFeeId(v === "NONE" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No recurring fee</SelectItem>
                  {hostelStructures.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} (৳{s.amount})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!hostelStructures.length && (
                <p className="text-xs text-muted-foreground">No active HOSTEL-category fee structures exist yet — set one up under Fee Structures to attach a recurring fee.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button disabled={approveHostelMutation.isPending} onClick={() => approveHostelMutation.mutate()}>
              {approveHostelMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectHostelTarget} onOpenChange={(v) => { if (!v) { setRejectHostelTarget(null); setRejectHostelReason(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => rejectHostelReason !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => rejectHostelReason !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Reject Hostel Request</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (shown to the student/guardian)</Label>
            <Input value={rejectHostelReason} onChange={(e) => setRejectHostelReason(e.target.value)} placeholder="e.g. Room is now at full capacity" />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => rejectHostelMutation.mutate()} disabled={rejectHostelMutation.isPending || !rejectHostelReason}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
