"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, RoutineGrid, PdfPreviewModal, extractErrorMessage, ErrorState, LoadingSpinner } from "@education-erp/ui";
import { api } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}
interface Subject {
  id: string;
  name_en: string;
}
interface Teacher {
  id: string;
  name_en: string;
  designation: string;
}
interface RoutineSlotRow {
  id: string;
  section_id: string | null;
  group_id: string | null;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject: { name_en: string } | null;
  teacher: { name_en: string } | null;
  group: { name_en: string } | null;
  room: { id: string; name: string; is_lab: boolean } | null;
}
interface RoomOption {
  id: string;
  name: string;
  is_lab: boolean;
  is_active: boolean;
}

const emptyForm = { section_id: "", group_id: "", day_of_week: 1, period_no: 1, start_time: "", end_time: "", subject_id: "", teacher_id: "", room_id: "" };

interface UnplacedItem {
  section_id: string;
  section_name: string;
  subject_id: string;
  subject_name: string;
  reason: string;
}
interface GenerateResult {
  class_id: string;
  class_name: string;
  placed_count: number;
  unplaced: UnplacedItem[];
}
interface GenerateResponse {
  results: GenerateResult[];
  failures: { class_id: string; error: string }[];
}

export default function RoutineSettingsPage() {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];
  const groups = selectedClass?.groups ?? [];

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["subjects", classId],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: classId } })).data.data,
    enabled: !!classId,
  });
  const { data: teachers } = useQuery<Teacher[]>({
    queryKey: ["staff", "teachers"],
    queryFn: async () => (await api.get("/api/staff/teachers")).data.data,
  });
  const { data: rooms } = useQuery<RoomOption[]>({
    queryKey: ["settings", "rooms"],
    queryFn: async () => (await api.get("/api/settings/rooms")).data.data,
  });
  const activeRooms = rooms?.filter((r) => r.is_active) ?? [];

  const { data: slots, isLoading: slotsLoading, isError: slotsError, error: slotsErrorObj, refetch: refetchSlots } = useQuery<RoutineSlotRow[]>({
    queryKey: ["settings", "routine", classId, sectionFilter, groupFilter],
    queryFn: async () =>
      (
        await api.get("/api/settings/routine", {
          params: { class_id: classId, ...(sectionFilter && { section_id: sectionFilter }), ...(groupFilter && { group_id: groupFilter }) },
        })
      ).data.data,
    enabled: !!classId,
  });

  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [pdfOpen, setPdfOpen] = useState(false);

  const gridData = useMemo(() => {
    const periodMap = new Map<number, { period_no: number; start_time: string; end_time: string; cells: Record<number, { subject: string; teacher: string } | null> }>();
    for (const s of slots ?? []) {
      if (!periodMap.has(s.period_no)) {
        periodMap.set(s.period_no, { period_no: s.period_no, start_time: s.start_time, end_time: s.end_time, cells: {} });
      }
      periodMap.get(s.period_no)!.cells[s.day_of_week] = { subject: s.subject?.name_en ?? "Free", teacher: s.teacher?.name_en ?? "" };
    }
    const days = DAYS;
    const rows = [...periodMap.values()]
      .sort((a, b) => a.period_no - b.period_no)
      .map((p) => ({ period_no: p.period_no, start_time: p.start_time, end_time: p.end_time, cells: days.map((_, i) => p.cells[i] ?? null) }));
    return { days, rows };
  }, [slots]);

  const pdfUrl = classId
    ? `${API_BASE_URL}/api/content/routine/pdf?class_id=${classId}${sectionFilter ? `&section_id=${sectionFilter}` : ""}${groupFilter ? `&group_id=${groupFilter}` : ""}`
    : null;

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, section_id: sectionFilter, group_id: groupFilter });
    setDialogOpen(true);
  }
  function openEdit(s: RoutineSlotRow) {
    setEditingId(s.id);
    setForm({
      section_id: s.section_id ?? "",
      group_id: "",
      day_of_week: s.day_of_week,
      period_no: s.period_no,
      start_time: s.start_time,
      end_time: s.end_time,
      subject_id: "",
      teacher_id: "",
      room_id: s.room?.id ?? "",
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        class_id: classId,
        section_id: form.section_id || null,
        group_id: form.group_id || null,
        day_of_week: Number(form.day_of_week),
        period_no: Number(form.period_no),
        start_time: form.start_time,
        end_time: form.end_time,
        subject_id: form.subject_id || null,
        teacher_id: form.teacher_id || null,
        room_id: form.room_id || null,
      };
      return editingId ? api.put(`/api/settings/routine/${editingId}`, payload) : api.post("/api/settings/routine", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Slot updated" : "Slot added");
      queryClient.invalidateQueries({ queryKey: ["settings", "routine"] });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to save slot";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/routine/${id}`),
    onSuccess: () => {
      toast.success("Slot removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "routine"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove slot"),
  });

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateScope, setGenerateScope] = useState<"CLASS" | "CAMPUS">("CLASS");
  const [generateClassId, setGenerateClassId] = useState("");
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/api/settings/routine/generate", {
        scope: generateScope,
        class_id: generateScope === "CLASS" ? generateClassId : undefined,
      }),
    onSuccess: (res) => {
      setGenerateResult(res.data.data);
      queryClient.invalidateQueries({ queryKey: ["settings", "routine"] });
      const total = res.data.data.results.reduce((sum: number, r: GenerateResult) => sum + r.placed_count, 0);
      const unplacedTotal = res.data.data.results.reduce((sum: number, r: GenerateResult) => sum + r.unplaced.length, 0);
      if (unplacedTotal > 0) {
        toast.warning(`Generated ${total} slot(s) — ${unplacedTotal} subject/section could not be scheduled, see details below`);
      } else {
        toast.success(`Generated ${total} slot(s)`);
      }
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to generate routine";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Routine / Timetable"
        subtitle="Weekly class schedule — period, subject, and teacher"
        breadcrumbs={[{ label: "Settings" }, { label: "Routine" }]}
        action={<Button variant="outline" onClick={() => { setGenerateResult(null); setGenerateOpen(true); }}>Auto-Generate</Button>}
      />

      <PdfPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        title="Class Routine"
        pdfUrl={pdfOpen ? pdfUrl : null}
      />

      <Card>
        <CardContent className={`grid grid-cols-1 gap-4 pt-6 ${groups.length ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <div className="space-y-1.5">
            <Label>Class</Label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setSectionFilter(""); setGroupFilter(""); }}
            >
              <option value="">Select...</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Section (optional)</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} disabled={!classId}>
              <option value="">All Sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {!!groups.length && (
            <div className="space-y-1.5">
              <Label>Group (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">All Groups</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={openCreate} disabled={!classId}>+ Add Slot</Button>
          </div>
        </CardContent>
      </Card>

      {classId && (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-1 rounded-md border p-0.5">
                <Button size="sm" variant={viewMode === "list" ? "default" : "ghost"} onClick={() => setViewMode("list")}>List</Button>
                <Button size="sm" variant={viewMode === "grid" ? "default" : "ghost"} onClick={() => setViewMode("grid")}>Grid</Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPdfOpen(true)} disabled={!slots?.length}>Download PDF</Button>
            </div>
            {slotsLoading ? (
              <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : slotsError ? (
              <ErrorState title="Failed to load routine slots" description={extractErrorMessage(slotsErrorObj)} retryLabel="Retry" onRetry={() => refetchSlots()} />
            ) : (
              <>
                {!slots?.length && <EmptyState title="No routine slots yet for this class/section" />}
                {!!slots?.length && viewMode === "grid" && <RoutineGrid days={gridData.days} rows={gridData.rows} todayIndex={new Date().getDay()} />}
                {!!slots?.length && viewMode === "list" && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Day</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Section</TableHead>
                        {!!groups.length && <TableHead>Group</TableHead>}
                        <TableHead>Subject</TableHead>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {slots.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{DAYS[s.day_of_week]}</TableCell>
                          <TableCell>{s.period_no}</TableCell>
                          <TableCell>{s.start_time}–{s.end_time}</TableCell>
                          <TableCell>{sections.find((sec) => sec.id === s.section_id)?.name ?? "All"}</TableCell>
                          {!!groups.length && <TableCell>{s.group?.name_en ?? "All Groups"}</TableCell>}
                          <TableCell>{s.subject?.name_en ?? "-"}</TableCell>
                          <TableCell>{s.teacher?.name_en ?? "-"}</TableCell>
                          <TableCell>{s.room?.name ?? "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>{" "}
                            <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Slot" : "Add Slot"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Day</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Period No.</Label>
              <Input type="number" min={1} value={form.period_no} onChange={(e) => setForm({ ...form, period_no: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}>
                <option value="">All Sections</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {!!groups.length && (
              <div className="space-y-1.5">
                <Label>Group</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                  <option value="">All Groups (shared subject)</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                <option value="">None</option>
                {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Teacher</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                <option value="">None</option>
                {teachers?.map((t) => <option key={t.id} value={t.id}>{t.name_en} ({t.designation})</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Room (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                <option value="">None</option>
                {activeRooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_lab ? " (Lab)" : ""}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.start_time || !form.end_time}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Auto-Generate Routine</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Places each compulsory subject into free periods based on each section&apos;s shift and the institution&apos;s working days. Re-running only
              replaces slots this generator created — any slot you&apos;ve hand-edited is left untouched. Subjects that can&apos;t be scheduled without
              double-booking a teacher are reported below, never force-placed.
            </p>
            {!generateResult && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Scope</Label>
                    <select className="w-full rounded-md border px-3 py-2 text-sm" value={generateScope} onChange={(e) => setGenerateScope(e.target.value as "CLASS" | "CAMPUS")}>
                      <option value="CLASS">One class</option>
                      <option value="CAMPUS">Whole campus</option>
                    </select>
                  </div>
                  {generateScope === "CLASS" && (
                    <div className="space-y-1.5">
                      <Label>Class</Label>
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={generateClassId} onChange={(e) => setGenerateClassId(e.target.value)}>
                        <option value="">Select...</option>
                        {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending || (generateScope === "CLASS" && !generateClassId)}
                  >
                    {generateMutation.isPending ? "Generating..." : "Generate"}
                  </Button>
                </DialogFooter>
              </>
            )}
            {generateResult && (
              <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                {generateResult.results.some((r) => r.unplaced.some((u) => u.reason.includes("has no periods configured"))) && (
                  <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm">
                    <p className="font-medium text-amber-800">Nothing could be generated for one or more sections because their Shift has no periods set up yet.</p>
                    <p className="mt-1 text-amber-700">
                      Go to <Link href="/settings/academic" className="underline">Settings → Academic Structure</Link>, open the affected
                      Shift, and add its periods (start/end time per period) before generating again.
                    </p>
                  </div>
                )}
                {generateResult.failures.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <p className="mb-1 font-medium text-destructive">Failed to generate for {generateResult.failures.length} class(es)</p>
                    {generateResult.failures.map((f) => (
                      <p key={f.class_id} className="text-muted-foreground">{f.class_id}: {f.error}</p>
                    ))}
                  </div>
                )}
                {generateResult.results.map((r) => (
                  <div key={r.class_id} className="rounded-md border p-3">
                    <p className="font-medium">{r.class_name}</p>
                    <p className="text-sm text-muted-foreground">{r.placed_count} slot(s) placed</p>
                    {r.unplaced.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-medium text-amber-700">Couldn&apos;t schedule — needs manual placement:</p>
                        {r.unplaced.map((u, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            {u.section_name} — {u.subject_name}: {u.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGenerateResult(null)}>Generate Again</Button>
                  <Button onClick={() => setGenerateOpen(false)}>Done</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
