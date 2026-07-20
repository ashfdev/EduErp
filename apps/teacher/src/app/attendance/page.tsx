"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, Card, CardContent, Input, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface MySection {
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
}
interface AttendanceRow {
  id: string;
  name_en: string;
  current_roll_no: string | null;
  status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY" | null;
  source: string | null;
}

const STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"] as const;
const STATUS_LABEL: Record<string, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "LV", HALF_DAY: "HD" };
const STATUS_COLOR: Record<string, string> = {
  PRESENT: "bg-emerald-100 border-emerald-400",
  ABSENT: "bg-red-100 border-red-400",
  LATE: "bg-amber-100 border-amber-400",
  LEAVE: "bg-blue-100 border-blue-400",
  HALF_DAY: "bg-yellow-100 border-yellow-400",
};

export default function TeacherAttendancePage() {
  const queryClient = useQueryClient();
  const t = useTranslations("attendance");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sectionId, setSectionId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});

  const { data: mySections } = useQuery<MySection[]>({
    queryKey: ["teacher", "my-sections"],
    queryFn: async () => (await api.get("/api/teacher/my-sections")).data.data,
  });
  const selectedSection = mySections?.find((s) => s.section_id === sectionId);

  const { data: rows, refetch } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance", sectionId, date],
    queryFn: async () => (await api.get("/api/attendance", { params: { section_id: sectionId, date } })).data.data,
    enabled: !!sectionId,
  });

  const effectiveMarks = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const r of rows ?? []) merged[r.id] = marks[r.id] ?? r.status ?? "";
    return merged;
  }, [rows, marks]);

  const unmarked = (rows?.length ?? 0) - Object.values(effectiveMarks).filter(Boolean).length;
  // Attendance already exists for this section/date if the server sent back
  // a pre-existing status on any row — drives the "you're editing, not
  // creating" banner and button label below.
  const alreadyMarked = (rows ?? []).some((r) => !!r.status);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/api/attendance/mark", {
        class_id: selectedSection?.class_id,
        section_id: sectionId,
        date,
        records: Object.entries(effectiveMarks).filter(([, v]) => v).map(([student_id, status]) => ({ student_id, status })),
      }),
    onSuccess: (res) => {
      const { saved, conflicts } = res.data.data;
      if (conflicts.length) {
        toast.warning(t("savedConflicts", { saved, conflicts: conflicts.length }));
      } else {
        toast.success(t("savedOk", { count: saved }));
      }
      setMarks({});
      queryClient.invalidateQueries({ queryKey: ["attendance", sectionId, date] });
      refetch();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? t("saveFailed");
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-primary to-blue-500 p-8 text-white shadow-xl shadow-indigo-200">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 -mb-10 h-32 w-32 rounded-full bg-blue-400/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-indigo-100 font-medium opacity-90">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-4 items-center">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40 rounded-xl border-slate-200 bg-slate-50 font-medium" />
            <select className="flex-1 min-w-[200px] max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">{t("selectClassSection")}</option>
              {mySections?.map((s) => <option key={s.section_id} value={s.section_id}>{s.class_name} — {s.section_name}</option>)}
            </select>
          </div>
        </div>

        {mySections && !mySections.length && (
          <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-500">{t("notAssigned")}</p>
          </div>
        )}

        {rows && (
          <div className="space-y-6">
            {alreadyMarked && (
              <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                {t("alreadyMarkedNotice", { date })}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-white px-3 py-1.5 rounded-lg border-slate-200 shadow-sm font-bold">{t("total", { count: rows.length })}</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border-amber-200 shadow-sm font-bold">{t("unmarked", { count: unmarked })}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-xl font-bold bg-white" onClick={() => setMarks(Object.fromEntries((rows ?? []).map((r) => [r.id, "PRESENT"])))}>
                  {t("markAllPresent")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl font-bold bg-white text-slate-500" onClick={() => setMarks({})}>{t("clear")}</Button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4">{t("colRoll")}</th>
                    <th className="px-6 py-4">{t("colName")}</th>
                    {STATUSES.map((s) => <th key={s} className="px-3 py-4 text-center">{STATUS_LABEL[s]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-bold text-slate-700">{r.current_roll_no ?? "—"}</td>
                      <td className="px-6 py-3 font-medium text-slate-800">{r.name_en}</td>
                      {STATUSES.map((s) => (
                        <td key={s} className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setMarks((prev) => ({ ...prev, [r.id]: s }))}
                            className={`h-8 w-8 rounded-full border-2 text-xs font-bold shadow-sm transition-all hover:scale-110 active:scale-95 ${effectiveMarks[r.id] === s ? STATUS_COLOR[s] : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"}`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button className="rounded-xl px-8 py-6 text-base font-bold shadow-md" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? t("saving") : alreadyMarked ? t("updateAttendance") : t("saveAttendance")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
