"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner } from "@education-erp/ui";

interface RoutineSlot {
  id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject: { name_en: string } | null;
}

const DAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

function RoutineContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("routine");
  const today = new Date().getDay();
  const [day, setDay] = useState(today);

  const { data, isLoading } = useQuery<RoutineSlot[]>({
    queryKey: ["portal", "routine", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/routine`)).data.data,
    enabled: !!activeStudentId,
  });

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
        const isCurrent = day === today && s.start_time <= now.toTimeString().slice(0, 5) && now.toTimeString().slice(0, 5) <= s.end_time;
        return (
          <Card key={s.id} className={isCurrent ? "border-[var(--primary,#1a3c4a)]" : ""}>
            <CardContent className="flex items-center justify-between pt-6 text-sm">
              <div>
                <p className="font-medium">{s.subject?.name_en ?? t("freePeriod")}</p>
                <p className="text-xs text-gray-500">{t("period", { no: s.period_no })}</p>
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
