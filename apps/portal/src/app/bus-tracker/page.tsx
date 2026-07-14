"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, EmptyState } from "@education-erp/ui";
import type { VehiclePoint } from "./map";

// Leaflet touches `window` at import time — must not run during SSR.
const BusTrackerMap = dynamic(() => import("./map").then((m) => m.BusTrackerMap), { ssr: false });

interface VehicleLocationResponse {
  route_name: string | null;
  vehicles: {
    vehicle_id: string;
    vehicle_no: string;
    latest_ping: { lat: number; lng: number; recorded_at: string } | null;
  }[];
}

function BusTrackerContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("busTracker");
  const { data, isLoading } = useQuery<VehicleLocationResponse>({
    queryKey: ["portal", "vehicle-location", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/vehicle-location`)).data.data,
    enabled: !!activeStudentId,
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  const points: VehiclePoint[] = (data?.vehicles ?? [])
    .filter((v) => v.latest_ping)
    .map((v) => ({ vehicle_id: v.vehicle_id, vehicle_no: v.vehicle_no, lat: v.latest_ping!.lat, lng: v.latest_ping!.lng, recorded_at: v.latest_ping!.recorded_at }));

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {!data?.route_name && <EmptyState title={t("noRoute")} />}
      {!!data?.route_name && !points.length && (
        <Card><CardContent className="pt-6"><p className="text-sm text-gray-500">{t("noSignal", { name: data.route_name })}</p></CardContent></Card>
      )}
      {!!points.length && (
        <>
          <p className="text-sm text-gray-500">{t("route", { name: data!.route_name! })}</p>
          <BusTrackerMap points={points} />
        </>
      )}
    </div>
  );
}

export default function BusTrackerPage() {
  return (
    <PortalShell>
      <BusTrackerContent />
    </PortalShell>
  );
}
