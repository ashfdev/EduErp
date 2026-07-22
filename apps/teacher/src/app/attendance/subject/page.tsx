"use client";

import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { useState } from "react";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface RosterStudent {
  id: string;
  name_en: string;
  current_roll_no: string | null;
  photo_url: string | null;
  existing: { status: string; marked_by_id: string | null; updated_at: string } | null;
}
interface RosterResponse {
  slot: {
    id: string;
    subject: { id: string; name_en: string };
    class: { id: string; name_en: string };
    section: { id: string; name: string };
    group: { id: string; name_en: string } | null;
    period_no: number;
    start_time: string;
    end_time: string;
  };
  date: string;
  students: RosterStudent[];
}

// Deliberately 3 statuses here, not the full 5-value enum — LEAVE/HALF_DAY
// are whole-day concepts that belong to the daily/campus attendance flow,
// not a single subject period.
const STATUSES = ["PRESENT", "ABSENT", "LATE"] as const;
const STATUS_LABEL: Record<string, string> = { PRESENT: "P", ABSENT: "A", LATE: "L" };
const STATUS_COLOR: Record<string, string> = {
  PRESENT: "bg-emerald-100 border-emerald-400",
  ABSENT: "bg-red-100 border-red-400",
  LATE: "bg-amber-100 border-amber-400",
};

export default function SubjectAttendancePage() {
  const searchParams = useSearchParams();
  const routineSlotId = searchParams.get("routine_slot_id") ?? "";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState<Record<string, string>>({});

  const { data, isError, error } = useQuery<RosterResponse>({
    queryKey: ["attendance", "subject-wise", "roster", routineSlotId, date],
    queryFn: async () => (await api.get("/api/attendance/subject-wise/roster", { params: { routine_slot_id: routineSlotId, date } })).data.data,
    enabled: !!routineSlotId,
  });

  const effectiveMarks: Record<string, string> = {};
  for (const s of data?.students ?? []) effectiveMarks[s.id] = marks[s.id] ?? s.existing?.status ?? "";
  const alreadyMarked = (data?.students ?? []).some((s) => !!s.existing);
  const unmarked = (data?.students.length ?? 0) - Object.values(effectiveMarks).filter(Boolean).length;

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/api/attendance/subject-wise/mark", {
        routine_slot_id: routineSlotId,
        date,
        records: Object.entries(effectiveMarks).filter(([, v]) => v).map(([student_id, status]) => ({ student_id, status })),
      }),
    onSuccess: (res) => {
      toast.success(`Saved attendance for ${res.data.data.saved} student(s)`);
      setMarks({});
      queryClient.invalidateQueries({ queryKey: ["attendance", "subject-wise", "roster", routineSlotId, date] });
      queryClient.invalidateQueries({ queryKey: ["teacher", "schedule", "today"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save attendance"),
  });

  if (!routineSlotId) {
    return (
      <TeacherShell>
        <PageWrapper>
          <PageHeader title="Subject Attendance" />
          <p className="text-sm text-muted-foreground">
            Open this from a specific period on{" "}
            <Link href="/" className="text-primary hover:underline">My Classes Today</Link>.
          </p>
        </PageWrapper>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell>
      <PageWrapper>
        {isError && <p className="text-sm text-red-600">{extractErrorMessage(error) ?? "Failed to load roster"}</p>}
        {data && (
          <>
            <PageHeader
              title={`${data.slot.subject.name_en} — Period ${data.slot.period_no}`}
              subtitle={`${data.slot.class.name_en} · Section ${data.slot.section.name}${data.slot.group ? ` · ${data.slot.group.name_en}` : ""} · ${data.slot.start_time}-${data.slot.end_time} · ${date}`}
            />

            {alreadyMarked && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                Attendance already recorded for this period — saving again will update it.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-2">
                <Badge variant="outline">{data.students.length} students</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700">{unmarked} unmarked</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMarks(Object.fromEntries(data.students.map((s) => [s.id, "PRESENT"])))}>
                  Mark All Present
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMarks({})}>Clear</Button>
              </div>
            </div>

            {!data.students.length && (
              <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-muted-foreground">
                No students are enrolled in this subject for this section.
              </p>
            )}

            {!!data.students.length && (
              <div className="overflow-hidden overflow-x-auto rounded-2xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs font-bold uppercase text-muted-foreground">
                      <th className="px-4 py-3">Roll</th>
                      <th className="px-4 py-3">Name</th>
                      {STATUSES.map((s) => <th key={s} className="px-3 py-3 text-center">{STATUS_LABEL[s]}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.students.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 font-semibold">{s.current_roll_no ?? "—"}</td>
                        <td className="px-4 py-2.5">{s.name_en}</td>
                        {STATUSES.map((status) => (
                          <td key={status} className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => setMarks((prev) => ({ ...prev, [s.id]: status }))}
                              className={`h-8 w-8 rounded-full border-2 text-xs font-bold transition-all hover:scale-110 active:scale-95 ${effectiveMarks[s.id] === status ? STATUS_COLOR[status] : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"}`}
                            >
                              {STATUS_LABEL[status]}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!!data.students.length && (
              <div className="flex justify-end">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : alreadyMarked ? "Update Attendance" : "Save Attendance"}
                </Button>
              </div>
            )}
          </>
        )}
      </PageWrapper>
    </TeacherShell>
  );
}
