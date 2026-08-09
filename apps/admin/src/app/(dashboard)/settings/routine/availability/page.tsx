"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Badge, Label, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Shift {
  id: string;
  name: string;
}

interface OccupiedBy {
  class_name: string;
  section_name: string | null;
  subject_name: string | null;
}
interface StatusRow {
  id: string;
  name: string;
  status: "FREE" | "OCCUPIED";
  occupied_by: OccupiedBy | null;
}
interface TeacherRow {
  id: string;
  name_en: string;
  designation: string | null;
  status: "FREE" | "OCCUPIED";
  occupied_by: OccupiedBy | null;
}
interface PeriodAvailability {
  period_no: number;
  start_time: string;
  end_time: string;
  rooms: StatusRow[];
  teachers: TeacherRow[];
}

function StatusBadgeCell({ status, occupiedBy }: { status: "FREE" | "OCCUPIED"; occupiedBy: OccupiedBy | null }) {
  if (status === "FREE") return <Badge variant="success">Free</Badge>;
  return (
    <div className="space-y-0.5">
      <Badge variant="destructive">Occupied</Badge>
      {occupiedBy && (
        <div className="text-xs text-muted-foreground">
          {occupiedBy.class_name}
          {occupiedBy.section_name ? ` (${occupiedBy.section_name})` : ""}
          {occupiedBy.subject_name ? ` — ${occupiedBy.subject_name}` : ""}
        </div>
      )}
    </div>
  );
}

export default function RoutineAvailabilityPage() {
  const today = new Date().getDay();
  const [dayOfWeek, setDayOfWeek] = useState(today);
  const [shiftId, setShiftId] = useState("");

  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["settings", "shifts"],
    queryFn: async () => (await api.get("/api/settings/shifts")).data.data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery<PeriodAvailability[]>({
    queryKey: ["settings", "routine", "availability", dayOfWeek, shiftId],
    queryFn: async () => (await api.get("/api/settings/routine/availability", { params: { day_of_week: dayOfWeek, shift_id: shiftId } })).data.data,
    enabled: !!shiftId,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Room & Teacher Availability"
        subtitle="See which rooms and teachers are free or busy for each period on a given day — for scheduling an extra class or finding a substitute."
        breadcrumbs={[{ label: "Settings" }, { label: "Routine", href: "/settings/routine" }, { label: "Availability" }]}
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Day</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">Select a shift...</option>
              {shifts?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {!shiftId ? (
        <EmptyState title="Pick a day and shift" description="Select a shift above to see room and teacher availability for that day." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load availability" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState title="No periods configured" description="This shift has no periods set up yet — add them under Settings → Shifts → Periods first." />
      ) : (
        <div className="space-y-6">
          {data.map((period) => (
            <Card key={period.period_no}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-baseline gap-3">
                  <h3 className="font-semibold">Period {period.period_no}</h3>
                  <span className="text-sm text-muted-foreground">{period.start_time} – {period.end_time}</span>
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-medium text-muted-foreground">Rooms</div>
                    <div className="space-y-2">
                      {period.rooms.map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                          <span className="text-sm">{r.name}</span>
                          <StatusBadgeCell status={r.status} occupiedBy={r.occupied_by} />
                        </div>
                      ))}
                      {!period.rooms.length && <p className="text-sm text-muted-foreground">No active rooms configured.</p>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium text-muted-foreground">Teachers</div>
                    <div className="space-y-2">
                      {period.teachers.map((t) => (
                        <div key={t.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                          <span className="text-sm">{t.name_en}{t.designation ? ` (${t.designation})` : ""}</span>
                          <StatusBadgeCell status={t.status} occupiedBy={t.occupied_by} />
                        </div>
                      ))}
                      {!period.teachers.length && <p className="text-sm text-muted-foreground">No teaching staff found.</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
