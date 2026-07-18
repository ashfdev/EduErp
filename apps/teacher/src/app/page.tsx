"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, EmptyState } from "@education-erp/ui";

interface ScheduleSlot {
  id: string;
  period_no: number;
  start_time: string;
  end_time: string;
  class: { name_en: string };
  section: { name: string } | null;
  subject: { name_en: string } | null;
  group: { name_en: string } | null;
}

export default function TeacherHomePage() {
  const { user } = useAuthStore();
  const t = useTranslations("home");

  const { data: schedule } = useQuery<ScheduleSlot[]>({
    queryKey: ["teacher", "schedule", "today"],
    queryFn: async () => (await api.get("/api/teacher/schedule/today")).data.data,
  });

  return (
    <TeacherShell>
      <h1 className="text-lg font-semibold">{t("welcome", { name: user?.name_en ?? "" })}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">{t("myClassesToday")}</p>
        <Card>
          <CardContent className="pt-6">
            {!schedule?.length && <EmptyState title={t("noClassesToday")} />}
            <div className="space-y-2">
              {schedule?.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{s.subject?.name_en ?? t("classFallback")} — {s.class.name_en}{s.section ? ` (${s.section.name})` : ""}{s.group ? ` · ${s.group.name_en}` : ""}</p>
                    <p className="text-xs text-gray-500">{t("period", { no: s.period_no })}</p>
                  </div>
                  <p className="text-xs text-gray-500">{s.start_time}–{s.end_time}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}
