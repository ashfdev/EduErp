"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Badge, SearchInput, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
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

export default function MarkAttendancePage() {
  const queryClient = useQueryClient();
  const t = useTranslations("attendanceMark");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data: rows, refetch, isLoading: rowsLoading, isError: rowsError, error: rowsErrorObj } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance", sectionId, date],
    queryFn: async () => (await api.get("/api/attendance", { params: { section_id: sectionId, date } })).data.data,
    enabled: !!sectionId,
  });

  const effectiveMarks = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const r of rows ?? []) merged[r.id] = marks[r.id] ?? r.status ?? "";
    return merged;
  }, [rows, marks]);

  const summary = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: Object.values(effectiveMarks).filter((v) => v === s).length }),
    {} as Record<string, number>,
  );
  const unmarked = (rows?.length ?? 0) - Object.values(effectiveMarks).filter(Boolean).length;

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows ?? [];
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => r.name_en.toLowerCase().includes(q) || (r.current_roll_no ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/api/attendance/mark", {
        class_id: classId,
        section_id: sectionId,
        date,
        records: Object.entries(effectiveMarks).filter(([, v]) => v).map(([student_id, status]) => ({ student_id, status })),
      }),
    onSuccess: (res) => {
      const { saved, conflicts } = res.data.data;
      if (conflicts.length) {
        toast.warning(t("savedConflicts", { saved, conflicts: conflicts.length }));
        console.warn("Attendance conflicts:", conflicts);
      } else {
        toast.success(t("savedOk", { count: saved }));
      }
      setMarks({});
      queryClient.invalidateQueries({ queryKey: ["attendance", sectionId, date] });
      refetch();
    },
    onError: () => toast.error(t("saveFailed")),
  });

  return (
    <PageWrapper>
      <PageHeader title={t("title")} breadcrumbs={[{ label: "Attendance" }, { label: "Mark" }]} />

      <div className="flex flex-wrap gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
          <option value="">{t("selectClass")}</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
          <option value="">{t("selectSection")}</option>
          {selectedClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {rowsLoading && <div className="flex justify-center py-16"><LoadingSpinner /></div>}
      {rowsError && <ErrorState title="Failed to load attendance" description={extractErrorMessage(rowsErrorObj)} retryLabel="Retry" onRetry={() => refetch()} />}

      {rows && (
        <>
          <div className="flex gap-3">
            <Badge variant="outline">{t("total", { count: rows.length })}</Badge>
            {STATUSES.map((s) => <Badge key={s} variant="secondary">{STATUS_LABEL[s]}: {summary[s]}</Badge>)}
            <Badge variant="outline">{t("unmarked", { count: unmarked })}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMarks(Object.fromEntries((rows ?? []).map((r) => [r.id, "PRESENT"])))}>
              {t("markAllPresent")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMarks({})}>{t("clear")}</Button>
            <SearchInput
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto max-w-xs"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colRoll")}</TableHead>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colSource")}</TableHead>
                    {STATUSES.map((s) => <TableHead key={s} className="text-center">{STATUS_LABEL[s]}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.current_roll_no ?? "—"}</TableCell>
                      <TableCell>
                        <Link href={`/students/${r.id}`} className="hover:underline" target="_blank">{r.name_en}</Link>
                      </TableCell>
                      <TableCell>
                        {r.source === "BIOMETRIC" && <Badge variant="outline">{t("biometric")}</Badge>}
                      </TableCell>
                      {STATUSES.map((s) => (
                        <TableCell key={s} className="text-center">
                          <button
                            type="button"
                            onClick={() => setMarks((prev) => ({ ...prev, [r.id]: s }))}
                            className={`h-7 w-7 rounded-full border text-xs ${effectiveMarks[r.id] === s ? STATUS_COLOR[s] : "border-muted"}`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t("saving") : t("saveAttendance")}
          </Button>
        </>
      )}
    </PageWrapper>
  );
}
