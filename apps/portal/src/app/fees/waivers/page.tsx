"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { FinancialSubNav } from "@/components/financial-sub-nav";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import {
  Card, CardContent, Badge, Button, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  LoadingSpinner, ErrorState, extractErrorMessage,
} from "@education-erp/ui";
import { GraduationCap, HandCoins } from "lucide-react";

interface WaiverRow {
  id: string;
  waiver_type: { name: string; discount_type: "PERCENTAGE" | "FIXED"; discount_value: number };
  academic_year: { id: string; label: string } | null;
  assigned_at: string;
}
interface WaiverRequestRow {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  created_at: string;
  student_waiver: { waiver_type: { name: string; discount_type: "PERCENTAGE" | "FIXED"; discount_value: number } } | null;
}

function statusVariant(status: string): "default" | "outline" | "destructive" {
  if (status === "APPROVED") return "default";
  if (status === "REJECTED") return "destructive";
  return "outline";
}
const STATUS_KEY = { PENDING: "statusPending", APPROVED: "statusApproved", REJECTED: "statusRejected" } as const;

function WaiversContent() {
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();
  const t = useTranslations("waivers");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { data: waivers, isLoading: waiversLoading, isError: waiversError, refetch: refetchWaivers } = useQuery<WaiverRow[]>({
    queryKey: ["portal", "waivers", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/waivers`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const { data: requests, isLoading: requestsLoading, isError: requestsError, refetch: refetchRequests } = useQuery<WaiverRequestRow[]>({
    queryKey: ["portal", "waiver-requests", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/waiver-requests`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/student/${activeStudentId}/waiver-requests`, { reason }),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["portal", "waiver-requests", activeStudentId] });
      setOpen(false);
      setReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to submit request"),
  });

  const isLoading = waiversLoading || requestsLoading;
  const isError = waiversError || requestsError;

  return (
    <div className="space-y-6 lg:space-y-8">
      <FinancialSubNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-2.5 text-amber-600">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-500">{t("subtitle")}</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>{t("requestButton")}</Button>
      </div>

      {isError ? (
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => { refetchWaivers(); refetchRequests(); }} />
      ) : isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <HandCoins className="h-5 w-5 text-slate-400" /> {t("myWaivers")}
            </h2>
            {!waivers?.length && (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                <p className="text-sm font-medium text-slate-500">{t("noWaivers")}</p>
              </div>
            )}
            {waivers?.map((w) => (
              <Card key={w.id} className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800">{w.waiver_type.name}</p>
                    <Badge>{w.waiver_type.discount_type === "PERCENTAGE" ? `${w.waiver_type.discount_value}%` : `৳${w.waiver_type.discount_value}`}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{w.academic_year?.label ?? t("everyYear")}</p>
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
                  <p className="text-sm text-slate-700">{r.reason}</p>
                  {r.status === "APPROVED" && r.student_waiver && (
                    <p className="text-sm font-semibold text-emerald-600">
                      {r.student_waiver.waiver_type.name} (
                      {r.student_waiver.waiver_type.discount_type === "PERCENTAGE" ? `${r.student_waiver.waiver_type.discount_value}%` : `৳${r.student_waiver.waiver_type.discount_value}`}
                      )
                    </p>
                  )}
                  {r.status === "REJECTED" && r.rejection_reason && (
                    <p className="text-sm text-rose-600">{t("rejectionReason", { reason: r.rejection_reason })}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
        <DialogContent
          onEscapeKeyDown={(e) => reason !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => reason !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>{t("requestTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>{t("reasonLabel")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} rows={4} />
          </div>
          <DialogFooter>
            <Button disabled={!reason.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WaiversPage() {
  return (
    <PortalShell>
      <WaiversContent />
    </PortalShell>
  );
}
