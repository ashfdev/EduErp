"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { FacilitiesSubNav } from "@/components/facilities-sub-nav";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import {
  Card, CardContent, Badge, Button, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  LoadingSpinner, ErrorState, extractErrorMessage,
} from "@education-erp/ui";
import { BedDouble, Building } from "lucide-react";

interface RoomRow {
  id: string;
  room_no: string;
  floor: number;
  capacity: number;
  type: string | null;
  block_name: string;
  beds_free: number;
}
interface RequestRow {
  id: string;
  room: { room_no: string; block: { name: string } };
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  created_at: string;
}

function statusVariant(status: string): "default" | "outline" | "destructive" {
  if (status === "APPROVED") return "default";
  if (status === "REJECTED") return "destructive";
  return "outline";
}
const STATUS_KEY = { PENDING: "statusPending", APPROVED: "statusApproved", REJECTED: "statusRejected" } as const;

function HostelContent() {
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();
  const t = useTranslations("facilitiesHostel");
  const tCommon = useTranslations("common");
  const [selectedRoom, setSelectedRoom] = useState<RoomRow | null>(null);
  const [reason, setReason] = useState("");

  const { data: rooms, isLoading: roomsLoading, isError: roomsError, refetch: refetchRooms } = useQuery<RoomRow[]>({
    queryKey: ["portal", "hostel-rooms", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/hostel/available-rooms`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const { data: requests, isLoading: requestsLoading, isError: requestsError, refetch: refetchRequests } = useQuery<RequestRow[]>({
    queryKey: ["portal", "hostel-requests", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/hostel-requests`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/student/${activeStudentId}/hostel-requests`, { room_id: selectedRoom!.id, reason: reason || undefined }),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["portal", "hostel-requests", activeStudentId] });
      setSelectedRoom(null);
      setReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to submit request"),
  });

  const isLoading = roomsLoading || requestsLoading;
  const isError = roomsError || requestsError;
  const hasPendingOrApproved = requests?.some((r) => r.status === "PENDING" || r.status === "APPROVED");

  return (
    <div className="space-y-6 lg:space-y-8">
      <FacilitiesSubNav />

      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-100 p-2.5 text-violet-600">
          <BedDouble className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
      </div>

      {isError ? (
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => { refetchRooms(); refetchRequests(); }} />
      ) : isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <Building className="h-5 w-5 text-slate-400" /> {t("availableRooms")}
            </h2>
            {!rooms?.length && (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                <p className="text-sm font-medium text-slate-500">{t("noRooms")}</p>
              </div>
            )}
            {rooms?.map((r) => (
              <Card key={r.id} className="border-slate-200 shadow-sm">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800">{r.block_name} — {r.room_no}</p>
                    <Badge variant="outline">{t("bedsFree", { count: r.beds_free })}</Badge>
                  </div>
                  <p className="text-xs text-slate-400">{t("floor", { floor: r.floor })}{r.type ? ` · ${r.type}` : ""}</p>
                  <Button size="sm" disabled={hasPendingOrApproved} onClick={() => setSelectedRoom(r)}>
                    {t("requestButton")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">{t("myRequests")}</h2>
            {!requests?.length && (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                <p className="text-sm font-medium text-slate-500">{t("noRequests")}</p>
              </div>
            )}
            {requests?.map((r) => (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="space-y-1.5 p-5">
                  <div className="flex items-center justify-between">
                    <Badge variant={statusVariant(r.status)}>{t(STATUS_KEY[r.status])}</Badge>
                    <p className="text-xs text-slate-400">{t("requestedOn", { date: new Date(r.created_at).toLocaleDateString() })}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{r.room.block.name} — {r.room.room_no}</p>
                  {r.status === "REJECTED" && r.rejection_reason && (
                    <p className="text-sm text-rose-600">{t("rejectionReason", { reason: r.rejection_reason })}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!selectedRoom} onOpenChange={(v) => { if (!v) { setSelectedRoom(null); setReason(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => reason !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => reason !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>{t("requestTitle", { room: selectedRoom ? `${selectedRoom.block_name} — ${selectedRoom.room_no}` : "" })}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>{t("reasonLabel")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} rows={3} />
          </div>
          <DialogFooter>
            <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function HostelFacilityPage() {
  return (
    <PortalShell>
      <HostelContent />
    </PortalShell>
  );
}
