"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Badge } from "@education-erp/ui";
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
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t("saveFailed");
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        <div className="flex flex-wrap gap-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">{t("selectClassSection")}</option>
            {mySections?.map((s) => <option key={s.section_id} value={s.section_id}>{s.class_name} — {s.section_name}</option>)}
          </select>
        </div>

        {mySections && !mySections.length && <p className="text-sm text-muted-foreground">{t("notAssigned")}</p>}

        {rows && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t("total", { count: rows.length })}</Badge>
              <Badge variant="outline">{t("unmarked", { count: unmarked })}</Badge>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setMarks(Object.fromEntries((rows ?? []).map((r) => [r.id, "PRESENT"])))}>
                {t("markAllPresent")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMarks({})}>{t("clear")}</Button>
            </div>

            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">{t("colRoll")}</th>
                      <th className="p-2">{t("colName")}</th>
                      {STATUSES.map((s) => <th key={s} className="p-2 text-center">{STATUS_LABEL[s]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-2">{r.current_roll_no ?? "—"}</td>
                        <td className="p-2">{r.name_en}</td>
                        {STATUSES.map((s) => (
                          <td key={s} className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => setMarks((prev) => ({ ...prev, [r.id]: s }))}
                              className={`h-7 w-7 rounded-full border text-xs ${effectiveMarks[r.id] === s ? STATUS_COLOR[s] : "border-muted"}`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t("saving") : t("saveAttendance")}
            </Button>
          </>
        )}
      </PageWrapper>
    </TeacherShell>
  );
}
