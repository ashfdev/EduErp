"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, StatusBadge, EmptyState, extractErrorMessage,
  ErrorState, LoadingSpinner,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
}

interface StudentDailyRow {
  student_id: string;
  student_uid: string;
  name: string;
  roll_no: string | null;
  class_name: string | null;
  section_name: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  working_hours: number | null;
  status: string;
  punch_count: number;
}
interface DailySummaryResponse {
  date: string;
  is_working_day: boolean;
  summary: { total: number; present: number; late: number; absent: number; on_leave: number; weekend: number; unmarked: number };
  rows: StudentDailyRow[];
}

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function StudentEntryExitPage() {
  const [date, setDate] = useState(todayLocalDateString());
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data, isLoading, isError, error, refetch } = useQuery<DailySummaryResponse>({
    queryKey: ["attendance", "students", "daily-summary", date, classId, sectionId, status],
    queryFn: async () =>
      (
        await api.get("/api/attendance/students/daily-summary", {
          params: { date, class_id: classId || undefined, section_id: sectionId || undefined, status: status || undefined },
        })
      ).data.data,
  });

  const s = data?.summary;

  return (
    <PageWrapper>
      <PageHeader
        title="Student Entry/Exit"
        subtitle="Campus check-in/check-out times, derived from biometric punches (manually-marked attendance shows no punch time)"
        breadcrumbs={[{ label: "Attendance", href: "/attendance/mark" }, { label: "Entry/Exit" }]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Class</label>
          <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!!selectedClass?.sections?.length && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Section</label>
            <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {selectedClass.sections.map((sec) => <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PRESENT">Present</SelectItem>
              <SelectItem value="LATE">Late</SelectItem>
              <SelectItem value="ABSENT">Absent</SelectItem>
              <SelectItem value="LEAVE">On Leave</SelectItem>
              <SelectItem value="WEEKEND">Weekend</SelectItem>
              <SelectItem value="UNMARKED">Unmarked</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Card><CardContent className="pt-4 text-center"><p className="text-xl font-semibold">{s.total}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xl font-semibold text-emerald-600">{s.present}</p><p className="text-xs text-muted-foreground">Present</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xl font-semibold text-amber-600">{s.late}</p><p className="text-xs text-muted-foreground">Late</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xl font-semibold text-red-600">{s.absent}</p><p className="text-xs text-muted-foreground">Absent</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xl font-semibold text-blue-600">{s.on_leave}</p><p className="text-xs text-muted-foreground">On Leave</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xl font-semibold text-muted-foreground">{s.weekend}</p><p className="text-xs text-muted-foreground">Weekend</p></CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load attendance" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!data?.rows.length && <EmptyState title="No students found" description="Try adjusting the class, section, or status filter." />}

          {!!data?.rows.length && (
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Class / Section</TableHead>
                      <TableHead>Shift In</TableHead>
                      <TableHead>Shift Out</TableHead>
                      <TableHead>Entry Time</TableHead>
                      <TableHead>Exit Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Punches</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r.student_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.roll_no ?? "—"}</TableCell>
                        <TableCell>{r.class_name ?? "—"}{r.section_name ? ` — ${r.section_name}` : ""}</TableCell>
                        <TableCell>{r.shift_start_time ?? "—"}</TableCell>
                        <TableCell>{r.shift_end_time ?? "—"}</TableCell>
                        <TableCell>{formatTime(r.check_in_at)}</TableCell>
                        <TableCell>{formatTime(r.check_out_at)}</TableCell>
                        <TableCell>{r.working_hours !== null ? `${r.working_hours}h` : "—"}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell>{r.punch_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageWrapper>
  );
}
