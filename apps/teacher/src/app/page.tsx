"use client";

import { useQuery } from "@tanstack/react-query";
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
}

export default function TeacherHomePage() {
  const { user } = useAuthStore();

  const { data: schedule } = useQuery<ScheduleSlot[]>({
    queryKey: ["teacher", "schedule", "today"],
    queryFn: async () => (await api.get("/api/teacher/schedule/today")).data.data,
  });

  return (
    <TeacherShell>
      <h1 className="text-lg font-semibold">Welcome, {user?.name_en}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">My Classes Today</p>
        <Card>
          <CardContent className="pt-6">
            {!schedule?.length && <EmptyState title="No classes scheduled for today" />}
            <div className="space-y-2">
              {schedule?.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{s.subject?.name_en ?? "Class"} — {s.class.name_en}{s.section ? ` (${s.section.name})` : ""}</p>
                    <p className="text-xs text-gray-500">Period {s.period_no}</p>
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
