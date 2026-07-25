"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState, Badge, Button, RoutineGrid, PdfPreviewModal } from "@education-erp/ui";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface RoutineSlot {
  id: string;
  class_id: string;
  section_id: string | null;
  group_id: string | null;
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
  const [viewMode, setViewMode] = useState<"day" | "grid">("day");

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
      <RoutineViewToggle data={data ?? []} viewMode={viewMode} setViewMode={setViewMode} />
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      {viewMode === "grid" ? (
        <GridView data={data ?? []} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function RoutineViewToggle({
  data,
  viewMode,
  setViewMode,
}: {
  data: RoutineSlot[];
  viewMode: "day" | "grid";
  setViewMode: (v: "day" | "grid") => void;
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const first = data[0];
  const pdfUrl = first
    ? `${API_BASE_URL}/api/content/routine/pdf?class_id=${first.class_id}${first.section_id ? `&section_id=${first.section_id}` : ""}${first.group_id ? `&group_id=${first.group_id}` : ""}`
    : null;

  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-1 rounded-full bg-gray-100 p-0.5">
        <button
          onClick={() => setViewMode("day")}
          className={`rounded-full px-3 py-1 text-xs ${viewMode === "day" ? "bg-white shadow-sm" : "text-gray-500"}`}
        >
          Day
        </button>
        <button
          onClick={() => setViewMode("grid")}
          className={`rounded-full px-3 py-1 text-xs ${viewMode === "grid" ? "bg-white shadow-sm" : "text-gray-500"}`}
        >
          Week Grid
        </button>
      </div>
      <Button size="sm" variant="outline" onClick={() => setPdfOpen(true)} disabled={!first}>Download PDF</Button>
      <PdfPreviewModal open={pdfOpen} onOpenChange={setPdfOpen} title="Class Routine" pdfUrl={pdfOpen ? pdfUrl : null} />
    </div>
  );
}

function GridView({ data }: { data: RoutineSlot[] }) {
  const periodMap = new Map<number, { period_no: number; start_time: string; end_time: string; cells: Record<number, { subject: string; teacher: string; coveredBy?: string | null } | null> }>();
  for (const s of data) {
    if (!periodMap.has(s.period_no)) {
      periodMap.set(s.period_no, { period_no: s.period_no, start_time: s.start_time, end_time: s.end_time, cells: {} });
    }
    periodMap.get(s.period_no)!.cells[s.day_of_week] = { subject: s.subject?.name_en ?? "Free", teacher: "", coveredBy: s.covered_by };
  }
  const rows = [...periodMap.values()]
    .sort((a, b) => a.period_no - b.period_no)
    .map((p) => ({ period_no: p.period_no, start_time: p.start_time, end_time: p.end_time, cells: DAYS.map((_, i) => p.cells[i] ?? null) }));
  return <RoutineGrid days={DAYS} rows={rows} todayIndex={new Date().getDay()} />;
}

export default function RoutinePage() {
  return (
    <PortalShell>
      <RoutineContent />
    </PortalShell>
  );
}
