"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState } from "@education-erp/ui";

interface TransportHostel {
  transport: { route_name: string; fare: number; pickup_stop: string | null } | null;
  hostel: { block_name: string; room_no: string; bed_no: string | null; from_date: string } | null;
}

function TransportHostelContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("transportHostel");
  const tCommon = useTranslations("common");
  const { data, isLoading, isError, refetch } = useQuery<TransportHostel>({
    queryKey: ["portal", "transport-hostel", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/transport-hostel`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">{t("transport")}</p>
          {data?.transport ? (
            <div className="text-sm text-gray-700">
              <p>{t("route", { name: data.transport.route_name })}</p>
              <p>{t("pickupStop", { stop: data.transport.pickup_stop ?? t("notAvailable") })}</p>
              <p>{t("fare", { amount: data.transport.fare })}</p>
              <Link href="/bus-tracker" className="mt-1 inline-block text-xs text-[var(--primary,#1a3c4a)]">{t("trackBus")}</Link>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("notAvailable")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">{t("hostel")}</p>
          {data?.hostel ? (
            <div className="text-sm text-gray-700">
              <p>{t("block", { name: data.hostel.block_name })}</p>
              <p>{t("room", { room: data.hostel.room_no })} {data.hostel.bed_no && t("bed", { bed: data.hostel.bed_no })}</p>
              <p>{t("since", { date: new Date(data.hostel.from_date).toLocaleDateString() })}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("notAvailable")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TransportHostelPage() {
  return (
    <PortalShell>
      <TransportHostelContent />
    </PortalShell>
  );
}
