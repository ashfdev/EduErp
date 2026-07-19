"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { TeacherShell } from "@/components/teacher-shell";
import { PageWrapper, PageHeader, Card, CardContent, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface RoutineSlot {
  id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  class: { name_en: string };
  section: { name: string } | null;
  subject: { name_en: string } | null;
  group: { name_en: string } | null;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export default function TeacherRoutinePage() {
  const t = useTranslations("routine");

  const { data: slots } = useQuery<RoutineSlot[]>({
    queryKey: ["teacher", "schedule", "week"],
    queryFn: async () => (await api.get("/api/teacher/schedule/week")).data.data,
  });

  const byDay = new Map<number, RoutineSlot[]>();
  for (const s of slots ?? []) {
    byDay.set(s.day_of_week, [...(byDay.get(s.day_of_week) ?? []), s]);
  }
  const todayDayOfWeek = new Date().getDay();

  return (
    <TeacherShell>
      <PageWrapper>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        {!slots?.length && (
          <div className="py-8">
            <EmptyState title={t("noRoutine")} />
          </div>
        )}

        <div className="space-y-6">
          {DAY_NAMES.map((dayKey, dayIndex) => {
            const daySlots = byDay.get(dayIndex);
            if (!daySlots?.length) return null;
            const isToday = dayIndex === todayDayOfWeek;
            return (
              <div key={dayKey}>
                <h2 className={`mb-3 text-sm font-bold uppercase tracking-wider ${isToday ? "text-primary" : "text-slate-500"}`}>
                  {t(`days.${dayKey}`)} {isToday && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] normal-case text-primary">{t("todayBadge")}</span>}
                </h2>
                <div className="space-y-2">
                  {daySlots.map((s) => (
                    <Card key={s.id}>
                      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                            <span className="text-[10px] font-bold uppercase">{t("periodShort")}</span>
                            <span className="text-base font-black leading-none">{s.period_no}</span>
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{s.subject?.name_en ?? t("classFallback")}</p>
                            <p className="text-sm font-medium text-slate-500 mt-0.5">
                              {s.class.name_en}
                              {s.section ? ` · ${s.section.name}` : ""}
                              {s.group ? ` · ${s.group.name_en}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg w-fit">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {s.start_time} - {s.end_time}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PageWrapper>
    </TeacherShell>
  );
}
