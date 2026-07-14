"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner } from "@education-erp/ui";

interface AttendanceRecord {
  date: string;
  status: string;
}

const STATUS_COLOR: Record<string, string> = {
  PRESENT: "bg-green-500",
  ABSENT: "bg-red-500",
  LATE: "bg-orange-500",
  LEAVE: "bg-blue-500",
  HALF_DAY: "bg-yellow-500",
};

function AttendanceContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("attendance");
  const [tab, setTab] = useState<"monthly" | "yearly">("monthly");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["portal", "attendance", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/attendance`)).data.data,
    enabled: !!activeStudentId,
  });

  const monthRecords = useMemo(() => (data ?? []).filter((r) => { const d = new Date(r.date); return d.getMonth() === month && d.getFullYear() === year; }), [data, month, year]);
  const byDay = useMemo(() => new Map(monthRecords.map((r) => [new Date(r.date).getDate(), r.status])), [monthRecords]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const summary = {
    P: monthRecords.filter((r) => r.status === "PRESENT").length,
    A: monthRecords.filter((r) => r.status === "ABSENT").length,
    L: monthRecords.filter((r) => r.status === "LATE" || r.status === "LEAVE").length,
    total: monthRecords.length,
  };

  const monthlyStats = useMemo(() => {
    const map = new Map<string, { present: number; total: number }>();
    for (const r of data ?? []) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const entry = map.get(key) ?? { present: 0, total: 0 };
      entry.total++;
      if (r.status === "PRESENT") entry.present++;
      map.set(key, entry);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [data]);

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="flex gap-2 text-sm">
        <button onClick={() => setTab("monthly")} className={`rounded-full px-3 py-1 ${tab === "monthly" ? "bg-[var(--primary,#1a3c4a)] text-white" : "bg-gray-100"}`}>{t("monthly")}</button>
        <button onClick={() => setTab("yearly")} className={`rounded-full px-3 py-1 ${tab === "yearly" ? "bg-[var(--primary,#1a3c4a)] text-white" : "bg-gray-100"}`}>{t("yearly")}</button>
      </div>

      {tab === "monthly" && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }}>←</button>
            <p className="font-medium">{new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
            <button onClick={() => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }}>→</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const status = byDay.get(day);
              return (
                <div key={day} className={`flex h-8 items-center justify-center rounded ${status ? `${STATUS_COLOR[status] ?? "bg-gray-300"} text-white` : "bg-gray-100 text-gray-400"}`}>
                  {day}
                </div>
              );
            })}
          </div>
          <Card>
            <CardContent className="flex justify-around pt-6 text-sm">
              <span>{t("present")}: {summary.P}</span>
              <span>{t("absent")}: {summary.A}</span>
              <span>{t("late")}: {summary.L}</span>
              <span>{t("total")}: {summary.total}</span>
              <span>{summary.total ? Math.round((summary.P / summary.total) * 100) : 0}%</span>
            </CardContent>
          </Card>
        </>
      )}

      {tab === "yearly" && (
        <div className="space-y-2">
          {monthlyStats.map(([key, stat]) => {
            const [y, m] = key.split("-").map(Number);
            return (
              <Card key={key}>
                <CardContent className="flex items-center justify-between pt-6 text-sm">
                  <span>{new Date(y!, m!).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
                  <span>{stat.total ? Math.round((stat.present / stat.total) * 100) : 0}%</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <PortalShell>
      <AttendanceContent />
    </PortalShell>
  );
}
