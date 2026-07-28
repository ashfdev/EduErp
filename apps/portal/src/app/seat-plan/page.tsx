"use client";

import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, Badge, LoadingSpinner, ErrorState, EmptyState } from "@education-erp/ui";

interface SeatPlanEntry {
  id: string;
  exam: { id: string; name: string; status: string; start_date: string | null };
  session: { label: string; date: string; start_time: string; end_time: string } | null;
  hall: { name: string; room_number: string | null; floor: string | null } | null;
  hall_name: string | null;
  row_number: number | null;
  seat_in_row: number | null;
  seat_number: string | null;
}

function SeatPlanContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("seatPlanPage");
  const tCommon = useTranslations("common");

  const { data, isLoading, isError, refetch } = useQuery<SeatPlanEntry[]>({
    queryKey: ["portal", "seat-plans", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/seat-plans`)).data.data,
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
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      {!data?.length && <EmptyState title={t("noneTitle")} description={t("noneDescription")} />}

      {data?.map((s) => (
        <Card key={s.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">{s.exam.name}</p>
              {s.exam.status === "PUBLISHED" && <Badge variant="outline">{t("resultPublished")}</Badge>}
            </div>
            {s.session && (
              <p className="text-xs text-gray-500">
                {s.session.label} — {new Date(s.session.date).toLocaleDateString()} · {s.session.start_time}–{s.session.end_time}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-xs uppercase text-gray-500">{t("hall")}</p>
                <p className="font-semibold">{s.hall?.name ?? s.hall_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500">{t("roomFloor")}</p>
                <p className="font-semibold">
                  {[s.hall?.room_number && `${t("room")} ${s.hall.room_number}`, s.hall?.floor].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500">{t("row")}</p>
                <p className="font-semibold">{s.row_number ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500">{t("seat")}</p>
                <p className="font-semibold">{s.seat_in_row ?? s.seat_number ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SeatPlanPage() {
  return (
    <PortalShell>
      <SeatPlanContent />
    </PortalShell>
  );
}
