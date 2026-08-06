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
  Card, CardContent, Badge, Button, Label, Input, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  LoadingSpinner, ErrorState, extractErrorMessage,
} from "@education-erp/ui";
import { Bus, Route as RouteIcon } from "lucide-react";

interface RouteRow {
  id: string;
  name: string;
  fare: number;
  stops: { id: string; name: string }[];
  seat_capacity: number | null;
  seats_available: number | null;
}
interface RequestRow {
  id: string;
  route: { name: string; fare: number };
  pickup_stop: string | null;
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

function TransportContent() {
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();
  const t = useTranslations("facilitiesTransport");
  const tCommon = useTranslations("common");
  const [selectedRoute, setSelectedRoute] = useState<RouteRow | null>(null);
  const [pickupStop, setPickupStop] = useState("");
  const [reason, setReason] = useState("");

  const { data: routes, isLoading: routesLoading, isError: routesError, refetch: refetchRoutes } = useQuery<RouteRow[]>({
    queryKey: ["portal", "transport-routes", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/transport/available-routes`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const { data: requests, isLoading: requestsLoading, isError: requestsError, refetch: refetchRequests } = useQuery<RequestRow[]>({
    queryKey: ["portal", "transport-requests", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/transport-requests`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/student/${activeStudentId}/transport-requests`, { route_id: selectedRoute!.id, pickup_stop: pickupStop || undefined, reason: reason || undefined }),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["portal", "transport-requests", activeStudentId] });
      setSelectedRoute(null);
      setPickupStop("");
      setReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to submit request"),
  });

  const isLoading = routesLoading || requestsLoading;
  const isError = routesError || requestsError;
  const hasPendingOrApproved = requests?.some((r) => r.status === "PENDING" || r.status === "APPROVED");

  return (
    <div className="space-y-6 lg:space-y-8">
      <FacilitiesSubNav />

      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-sky-100 p-2.5 text-sky-600">
          <Bus className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
      </div>

      {isError ? (
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => { refetchRoutes(); refetchRequests(); }} />
      ) : isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <RouteIcon className="h-5 w-5 text-slate-400" /> {t("availableRoutes")}
            </h2>
            {!routes?.length && (
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                <p className="text-sm font-medium text-slate-500">{t("noRoutes")}</p>
              </div>
            )}
            {routes?.map((r) => (
              <Card key={r.id} className="border-slate-200 shadow-sm">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800">{r.name}</p>
                    <Badge variant="outline">৳{r.fare}</Badge>
                  </div>
                  {r.stops.length > 0 && (
                    <p className="text-xs text-slate-400">{r.stops.map((s) => s.name).join(" → ")}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {r.seats_available == null ? t("seatsUnlimited") : t("seatsAvailable", { count: r.seats_available })}
                  </p>
                  <Button
                    size="sm"
                    disabled={hasPendingOrApproved || (r.seats_available != null && r.seats_available <= 0)}
                    onClick={() => setSelectedRoute(r)}
                  >
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
                  <p className="text-sm font-semibold text-slate-700">{r.route.name} (৳{r.route.fare})</p>
                  {r.pickup_stop && <p className="text-xs text-slate-500">{t("pickupStop", { stop: r.pickup_stop })}</p>}
                  {r.status === "REJECTED" && r.rejection_reason && (
                    <p className="text-sm text-rose-600">{t("rejectionReason", { reason: r.rejection_reason })}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!selectedRoute} onOpenChange={(v) => { if (!v) { setSelectedRoute(null); setPickupStop(""); setReason(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => (pickupStop !== "" || reason !== "") && e.preventDefault()}
          onPointerDownOutside={(e) => (pickupStop !== "" || reason !== "") && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>{t("requestTitle", { route: selectedRoute?.name ?? "" })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("pickupStopLabel")}</Label>
              <Input value={pickupStop} onChange={(e) => setPickupStop(e.target.value)} placeholder={t("pickupStopPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("reasonLabel")}</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} rows={3} />
            </div>
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

export default function TransportFacilityPage() {
  return (
    <PortalShell>
      <TransportContent />
    </PortalShell>
  );
}
