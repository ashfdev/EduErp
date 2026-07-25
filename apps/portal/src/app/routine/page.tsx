"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState, Badge } from "@education-erp/ui";

interface RoutineSlot {
  id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject: { name_en: string } | null;
  // Only ever set for today's specific date, never a future/past occurrence
  // of this recurring weekly slot (Plan Fourteen, Phase C3).
  covered_by: string | null;
}

const DAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

type SlotStatus = "upcoming" | "ongoing" | "completed";

// Only meaningful for today's tab — day_of_week is a recurring weekly
// pattern, not a specific date, so "completed"/"upcoming" has no meaning
// when browsing a different day of the week.
function computeSlotStatus(s: RoutineSlot, nowTime: string): SlotStatus {
  if (nowTime < s.start_time) return "upcoming";
  if (nowTime <= s.end_time) return "ongoing";
  return "completed";
}

const STATUS_BADGE_VARIANT: Record<SlotStatus, "outline" | "default" | "success"> = {
  upcoming: "outline",
  ongoing: "default",
  completed: "success",
};

function RoutineContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("routine");
  const tCommon = useTranslations("common");
  const today = new Date().getDay();
  const [day, setDay] = useState(today);

  const { data, isLoading, isError, refetch } = useQuery<RoutineSlot[]>({
    queryKey: ["portal", "routine", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/routine`)).data.data,
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

  const daySlots = (data ?? []).filter((s) => s.day_of_week === day).sort((a, b) => a.period_no - b.period_no);
  const now = new Date();

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="flex gap-1 overflow-x-auto">
        {DAY_KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => setDay(i)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${i === day ? "bg-[var(--primary,#1a3c4a)] text-white" : "bg-gray-100"} ${i === today ? "ring-2 ring-[var(--primary,#1a3c4a)]" : ""}`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {!daySlots.length && <p className="text-sm text-gray-500">{t("noClasses")}</p>}
      {daySlots.map((s) => {
        const isToday = day === today;
        const status = isToday ? computeSlotStatus(s, now.toTimeString().slice(0, 5)) : null;
        return (
          <Card key={s.id} className={status === "ongoing" ? "border-[var(--primary,#1a3c4a)]" : ""}>
            <CardContent className="flex items-center justify-between pt-6 text-sm">
              <div>
                <p className="font-medium">{s.subject?.name_en ?? t("freePeriod")}</p>
                <p className="text-xs text-gray-500">{t("period", { no: s.period_no })}</p>
                {status && (
                  <Badge variant={STATUS_BADGE_VARIANT[status]} className="mt-1.5">
                    {t(`status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
                  </Badge>
                )}
                {s.covered_by && (
                  <Badge variant="warning" className="mt-1.5 ml-1.5">
                    Covered today by {s.covered_by}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500">{s.start_time} – {s.end_time}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function RoutinePage() {
  return (
    <PortalShell>
      <RoutineContent />
    </PortalShell>
  );
}
