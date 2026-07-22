"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, StatusBadge, EmptyState, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffDailyRow {
  staff_id: string;
  name: string;
  designation: string;
  shift_start_time: string | null;
  shift_end_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  working_hours: number | null;
  overtime_hours: number;
  status: string;
  punch_count: number;
}
interface DailySummaryResponse {
  date: string;
  is_working_day: boolean;
  summary: { total: number; present: number; late: number; absent: number; on_leave: number; weekend: number; unmarked: number };
  rows: StaffDailyRow[];
}

const MANUAL_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"] as const;

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function EmployeeAttendancePage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayLocalDateString());
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery<DailySummaryResponse>({
    queryKey: ["hr", "attendance", "daily-summary", date, position, status],
    queryFn: async () =>
      (
        await api.get("/api/attendance/staff/daily-summary", {
          params: { date, position: position || undefined, status: status || undefined },
        })
      ).data.data,
  });

  const markMutation = useMutation({
    mutationFn: ({ staffId, newStatus }: { staffId: string; newStatus: string }) =>
      api.post("/api/attendance/staff/mark", { date, records: [{ staff_id: staffId, status: newStatus }] }),
    onSuccess: () => {
      toast.success("Attendance updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "attendance", "daily-summary"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update attendance"),
  });

  const s = data?.summary;

  return (
    <PageWrapper>
      <PageHeader title="Employee Attendance" subtitle="Daily staff attendance, derived from manual marking and biometric punches" breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Attendance" }]} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Position</label>
          <Input placeholder="e.g. Assistant Teacher" value={position} onChange={(e) => setPosition(e.target.value)} className="w-48" />
        </div>
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

      {!isLoading && !data?.rows.length && <EmptyState title="No staff found" description="Try adjusting the position or status filter." />}

      {!!data?.rows.length && (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Office In</TableHead>
                  <TableHead>Office Out</TableHead>
                  <TableHead>In Time</TableHead>
                  <TableHead>Out Time</TableHead>
                  <TableHead>Working Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Overtime</TableHead>
                  <TableHead>Punches</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.staff_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.designation}</TableCell>
                    <TableCell>{r.shift_start_time ?? "—"}</TableCell>
                    <TableCell>{r.shift_end_time ?? "—"}</TableCell>
                    <TableCell>{formatTime(r.check_in_at)}</TableCell>
                    <TableCell>{formatTime(r.check_out_at)}</TableCell>
                    <TableCell>{r.working_hours !== null ? `${r.working_hours}h` : "—"}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>{r.overtime_hours > 0 ? `${r.overtime_hours}h` : "—"}</TableCell>
                    <TableCell>{r.punch_count}</TableCell>
                    <TableCell>
                      {data.is_working_day && (
                        <Select value="" onValueChange={(newStatus) => markMutation.mutate({ staffId: r.staff_id, newStatus })}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Mark…" /></SelectTrigger>
                          <SelectContent>
                            {MANUAL_STATUSES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
