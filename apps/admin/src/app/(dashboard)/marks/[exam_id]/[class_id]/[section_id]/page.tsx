"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, ErrorState, Input, LoadingSpinner, PageHeader, PageWrapper, SearchInput, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface MarkComponent {
  key: string;
  label: string;
  max_marks: number;
  source_type: "MANUAL" | "ATTENDANCE_PERCENTAGE" | "AVERAGE_OF_EXAMS";
}
interface Subject {
  id: string;
  name_en: string;
  config?: { full_marks_theory: number; full_marks_practical: number };
  mark_components?: MarkComponent[];
}
interface ComponentFetchEntry {
  value: number | null;
  annotation: string | null;
}
interface MarkEntryData {
  entry_deadline_info: { is_open: boolean; closes_at: string | null };
  exam_has_subjects_for_class: boolean;
  subjects: Subject[];
  students: {
    id: string;
    name_en: string;
    current_roll_no: string | null;
    group_id: string | null;
    marks: Record<
      string,
      {
        marks_theory: number | null;
        marks_practical: number | null;
        is_absent: boolean;
        component_values?: Record<string, { value: number | null; is_override: boolean }> | null;
        status: string;
      } | null
    >;
    enrolled_subject_ids: string[];
    component_fetch?: Record<string, Record<string, ComponentFetchEntry>>;
  }[];
}
interface ExamInfo {
  id: string;
  name: string;
  status: string;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}

export default function MarkEntryGridPage() {
  const { exam_id, class_id, section_id } = useParams<{ exam_id: string; class_id: string; section_id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const readOnly = user?.role === "CLASS_TEACHER";
  const [groupFilter, setGroupFilter] = useState(searchParams.get("group_id") ?? "");

  const { data, isLoading, isError, error, refetch } = useQuery<MarkEntryData>({
    queryKey: ["marks", exam_id, class_id, section_id],
    queryFn: async () => (await api.get(`/api/marks/${exam_id}/${class_id}/${section_id}`)).data.data,
  });

  const { data: exam } = useQuery<ExamInfo>({
    queryKey: ["exams", exam_id],
    queryFn: async () => (await api.get(`/api/exams/${exam_id}`)).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const klass = classes?.find((c) => c.id === class_id);
  const section = klass?.sections.find((s) => s.id === section_id);

  const [edits, setEdits] = useState<
    Record<
      string,
      {
        marks_theory?: number;
        marks_practical?: number;
        is_absent?: boolean;
        component_values?: Record<string, { value: number | null; is_override: boolean }>;
      }
    >
  >({});
  const [search, setSearch] = useState("");

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    let rows = data.students;
    if (groupFilter) rows = rows.filter((st) => st.group_id === groupFilter);
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((st) => st.name_en.toLowerCase().includes(q) || (st.current_roll_no ?? "").toLowerCase().includes(q));
  }, [data, search, groupFilter]);

  function key(studentId: string, subjectId: string) {
    return `${studentId}:${subjectId}`;
  }

  // The `max` HTML attribute on a plain number input enforces nothing on its
  // own — no native form submission happens here, so a value over cap was
  // previously invisible until the server rejected the whole submit. Scans
  // only the (small) set of cells actually edited this session, checking
  // each edited cell against its own subject's real cap — either the sum of
  // its mark-composition parts against the subject total, or a plain
  // Theory/Practical value against its own config cap.
  const overCapCells = useMemo(() => {
    const bad = new Set<string>();
    for (const [k, edit] of Object.entries(edits)) {
      const [, subjectId] = k.split(":") as [string, string];
      const subject = data?.subjects.find((s) => s.id === subjectId);
      if (!subject) continue;
      if (edit.component_values) {
        for (const comp of subject.mark_components ?? []) {
          const v = edit.component_values[comp.key]?.value;
          if (v != null && v > comp.max_marks) bad.add(k);
        }
      } else {
        if (edit.marks_theory != null && subject.config && edit.marks_theory > subject.config.full_marks_theory) bad.add(k);
        if (edit.marks_practical != null && subject.config && edit.marks_practical > subject.config.full_marks_practical) bad.add(k);
      }
    }
    return bad;
  }, [edits, data]);

  function getValue(studentId: string, subjectId: string) {
    const k = key(studentId, subjectId);
    if (edits[k]) return edits[k];
    const existing = data?.students.find((s) => s.id === studentId)?.marks[subjectId];
    return {
      marks_theory: existing?.marks_theory ?? undefined,
      marks_practical: existing?.marks_practical ?? undefined,
      is_absent: existing?.is_absent ?? false,
    };
  }

  function entryStatus(studentId: string, subjectId: string): string | undefined {
    return data?.students.find((s) => s.id === studentId)?.marks[subjectId]?.status;
  }

  function isEnrolled(studentId: string, subjectId: string): boolean {
    return !!data?.students.find((s) => s.id === studentId)?.enrolled_subject_ids.includes(subjectId);
  }

  // An empty box must stay empty, not snap to 0 — Number("") === 0, so it's
  // treated as "not entered yet" (undefined) instead of coercing on every keystroke.
  function parseMarkInput(raw: string): number | undefined {
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }

  // Resolves the current value for every mark-composition part of one cell:
  // an in-progress local edit wins first, then an already-stored teacher
  // override (is_override: true) from a prior submit, then the freshly-
  // computed auto-fetch, else null ("no source data yet" — never a silent 0).
  function getComponentValues(studentId: string, subjectId: string): Record<string, { value: number | null; is_override: boolean }> {
    const k = key(studentId, subjectId);
    if (edits[k]?.component_values) return edits[k].component_values!;
    const student = data?.students.find((s) => s.id === studentId);
    const stored = student?.marks[subjectId]?.component_values ?? {};
    const fetched = student?.component_fetch?.[subjectId] ?? {};
    const subject = data?.subjects.find((s) => s.id === subjectId);
    const merged: Record<string, { value: number | null; is_override: boolean }> = {};
    for (const comp of subject?.mark_components ?? []) {
      const storedEntry = stored[comp.key];
      merged[comp.key] = storedEntry?.is_override ? storedEntry : { value: fetched[comp.key]?.value ?? null, is_override: false };
    }
    return merged;
  }

  function setComponentValue(studentId: string, subjectId: string, componentKey: string, raw: string) {
    const v = getValue(studentId, subjectId);
    const current = getComponentValues(studentId, subjectId);
    const parsed = parseMarkInput(raw);
    const next = { ...current, [componentKey]: { value: parsed ?? null, is_override: true } };
    setEdits((prev) => ({ ...prev, [key(studentId, subjectId)]: { ...v, component_values: next } }));
  }

  const submitMutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(edits).map(([k, v]) => {
        const [student_id, subject_id] = k.split(":") as [string, string];
        // Always resolve the FULL set of component values for this cell
        // (not just whatever key the teacher happened to touch directly) —
        // otherwise editing only one box would submit component_values as
        // partial, silently dropping the other parts the server needs to
        // compute the real total.
        const subject = data?.subjects.find((s) => s.id === subject_id);
        const componentValues = subject?.mark_components?.length ? getComponentValues(student_id, subject_id) : undefined;
        return {
          student_id,
          subject_id,
          marks_theory: v.marks_theory,
          marks_practical: v.marks_practical,
          component_values: componentValues,
          is_absent: v.is_absent,
        };
      });
      return api.post("/api/marks/submit", { exam_id, entries });
    },
    onSuccess: () => {
      toast.success("Marks submitted for approval");
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["marks", exam_id, class_id, section_id] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to submit marks";
      toast.error(message);
    },
  });

  const [confirmReapproval, setConfirmReapproval] = useState(false);

  function handleSubmit() {
    const approvedTouched = Object.keys(edits).filter((k) => {
      const [studentId, subjectId] = k.split(":") as [string, string];
      return entryStatus(studentId, subjectId) === "APPROVED";
    }).length;
    if (approvedTouched > 0) {
      setConfirmReapproval(true);
      return;
    }
    submitMutation.mutate();
  }

  const approvedTouchedCount = Object.keys(edits).filter((k) => {
    const [studentId, subjectId] = k.split(":") as [string, string];
    return entryStatus(studentId, subjectId) === "APPROVED";
  }).length;

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      </PageWrapper>
    );
  }

  if (isError || !data) {
    return (
      <PageWrapper>
        <ErrorState title="Failed to load mark entry grid" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title={exam?.name ?? "Mark Entry"}
        subtitle={`${klass?.name_en ?? "…"} · ${section?.name ?? "…"} — ${data.entry_deadline_info.is_open ? "Entry window is open" : "Entry window is closed"}`}
        breadcrumbs={[{ label: "Marks", href: "/marks" }, ...(exam ? [{ label: exam.name }] : []), ...(klass && section ? [{ label: `${klass.name_en} · ${section.name}` }] : [])]}
      />

      {!data.subjects.length && (
        <p className="text-sm text-muted-foreground">
          {data.exam_has_subjects_for_class
            ? "You are not assigned to teach any of this exam's subjects for this class/section. If you should have access, check this teacher's Subject-Teacher Assignment in Settings."
            : "This exam has no subjects configured for this class/section — it may not have been set up for this class. Double-check the exam and class selection."}
        </p>
      )}

      {readOnly && data.subjects.length > 0 && (
        <p className="text-sm text-muted-foreground">You can view marks for your class, but only Subject Teachers, Exam Controllers, and Admins can enter or edit them.</p>
      )}

      {data.subjects.length > 0 && (
        <div className="flex gap-3">
          <SearchInput placeholder="Search by name or roll..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          {!!klass?.groups?.length && (
            <select
              className="rounded-md border-2 border-primary/40 px-3 py-2 text-sm font-medium"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Group: All Groups</option>
              {klass.groups.map((g) => <option key={g.id} value={g.id}>Group: {g.name_en}</option>)}
            </select>
          )}
        </div>
      )}

      {data.subjects.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Roll</TableHead>
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  {data.subjects.map((s) => (
                    <TableHead key={s.id} className="min-w-[200px]">
                      {s.name_en} <span className="text-xs">/{(s.config?.full_marks_theory ?? 0) + (s.config?.full_marks_practical ?? 0)}</span>
                      {s.mark_components && s.mark_components.length > 0 ? (
                        <div className="flex flex-wrap gap-2 text-[10px] font-normal normal-case text-muted-foreground">
                          {s.mark_components.map((comp) => (
                            <span key={comp.key} title={comp.source_type !== "MANUAL" ? "Auto-fetched, editable" : undefined}>
                              {comp.label}/{comp.max_marks}
                            </span>
                          ))}
                        </div>
                      ) : (
                        !!s.config?.full_marks_practical && (
                          <div className="flex gap-2 text-[10px] font-normal normal-case text-muted-foreground">
                            <span>Theory/{s.config.full_marks_theory}</span>
                            <span>Practical/{s.config.full_marks_practical}</span>
                          </div>
                        )
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell>{st.current_roll_no}</TableCell>
                    <TableCell>
                      <Link href={`/students/${st.id}`} className="hover:underline" target="_blank">{st.name_en}</Link>
                    </TableCell>
                    {data.subjects.map((s) => {
                      const enrolled = isEnrolled(st.id, s.id);
                      if (!enrolled) {
                        return (
                          <TableCell key={s.id} className="text-center">
                            <span className="text-muted-foreground" title="Not enrolled in this subject">—</span>
                          </TableCell>
                        );
                      }
                      const v = getValue(st.id, s.id);
                      const status = entryStatus(st.id, s.id);
                      const hasMarkComponents = !!s.mark_components?.length;
                      const componentValues = hasMarkComponents ? getComponentValues(st.id, s.id) : {};
                      const componentSum = hasMarkComponents
                        ? Object.values(componentValues).reduce((sum, e) => sum + (e.value ?? 0), 0)
                        : undefined;
                      const subjectTotal = (s.config?.full_marks_theory ?? 0) + (s.config?.full_marks_practical ?? 0);
                      const annotations = hasMarkComponents
                        ? (s.mark_components ?? [])
                            .filter((c) => c.source_type !== "MANUAL")
                            .map((c) => st.component_fetch?.[s.id]?.[c.key]?.annotation)
                            .filter((a): a is string => !!a)
                        : [];
                      return (
                        <TableCell key={s.id} className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            {status === "APPROVED" && (
                              <Badge variant="success" title="Already approved — editing will require re-approval">✓</Badge>
                            )}
                            {hasMarkComponents ? (
                              <>
                                {(s.mark_components ?? []).map((comp) => {
                                  const entry = componentValues[comp.key];
                                  const isAutoUnedited = comp.source_type !== "MANUAL" && !entry?.is_override;
                                  const isOverCap = entry?.value != null && entry.value > comp.max_marks;
                                  return (
                                    <div key={comp.key} className="flex flex-col items-start">
                                      <span className="text-[9px] text-muted-foreground">{comp.label}/{comp.max_marks}</span>
                                      <Input
                                        type="number"
                                        min={0}
                                        max={comp.max_marks}
                                        title={
                                          isOverCap
                                            ? `${comp.label} cannot exceed ${comp.max_marks}`
                                            : isAutoUnedited
                                              ? `${comp.label}, auto-fetched (out of ${comp.max_marks}) — edit to override`
                                              : `${comp.label}, out of ${comp.max_marks}`
                                        }
                                        className={`h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                                          isOverCap ? "border-red-500 bg-red-50 text-red-700" : isAutoUnedited ? "border-dashed text-muted-foreground" : ""
                                        }`}
                                        disabled={readOnly || v.is_absent}
                                        value={entry?.value ?? ""}
                                        onChange={(e) => setComponentValue(st.id, s.id, comp.key, e.target.value)}
                                      />
                                      {isOverCap && <span className="text-[9px] font-medium text-red-600">Max {comp.max_marks}</span>}
                                    </div>
                                  );
                                })}
                                <span className={`text-xs font-medium ${(componentSum ?? 0) > subjectTotal ? "text-red-600" : "text-muted-foreground"}`}>
                                  ={componentSum}/{subjectTotal}
                                </span>
                              </>
                            ) : (
                              <>
                                {(() => {
                                  const theoryOverCap = v.marks_theory != null && !!s.config && v.marks_theory > s.config.full_marks_theory;
                                  return (
                                    <div className="flex flex-col items-start">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={s.config?.full_marks_theory}
                                        title={theoryOverCap ? `Theory cannot exceed ${s.config!.full_marks_theory}` : s.config ? `Theory, out of ${s.config.full_marks_theory}` : "Theory"}
                                        className={`h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${theoryOverCap ? "border-red-500 bg-red-50 text-red-700" : ""}`}
                                        disabled={readOnly || v.is_absent}
                                        value={v.marks_theory ?? ""}
                                        onChange={(e) =>
                                          setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, marks_theory: parseMarkInput(e.target.value) } }))
                                        }
                                      />
                                      {theoryOverCap && <span className="text-[9px] font-medium text-red-600">Max {s.config!.full_marks_theory}</span>}
                                    </div>
                                  );
                                })()}
                                {!!s.config?.full_marks_practical && (
                                  (() => {
                                    const practicalOverCap = v.marks_practical != null && v.marks_practical > s.config!.full_marks_practical;
                                    return (
                                      <div className="flex flex-col items-start">
                                        <Input
                                          type="number"
                                          min={0}
                                          max={s.config.full_marks_practical}
                                          title={practicalOverCap ? `Practical cannot exceed ${s.config.full_marks_practical}` : `Practical, out of ${s.config.full_marks_practical}`}
                                          className={`h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${practicalOverCap ? "border-red-500 bg-red-50 text-red-700" : ""}`}
                                          disabled={readOnly || v.is_absent}
                                          value={v.marks_practical ?? ""}
                                          onChange={(e) =>
                                            setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, marks_practical: parseMarkInput(e.target.value) } }))
                                          }
                                        />
                                        {practicalOverCap && <span className="text-[9px] font-medium text-red-600">Max {s.config!.full_marks_practical}</span>}
                                      </div>
                                    );
                                  })()
                                )}
                              </>
                            )}
                            <label className="flex items-center gap-1 text-xs">
                              <Checkbox
                                checked={v.is_absent ?? false}
                                disabled={readOnly}
                                onCheckedChange={(checked) => setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, is_absent: checked === true } }))}
                              />
                              Ab
                            </label>
                          </div>
                          {annotations.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {annotations.map((a, i) => (
                                <p key={i} className="text-[10px] leading-tight text-red-600">{a}</p>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.subjects.length > 0 && !readOnly && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSubmit} disabled={submitMutation.isPending || !Object.keys(edits).length || overCapCells.size > 0}>
            {submitMutation.isPending ? "Submitting..." : "Submit Marks"}
          </Button>
          <Badge variant="outline">{Object.keys(edits).length} pending change(s)</Badge>
          {overCapCells.size > 0 && (
            <Badge variant="destructive">
              {overCapCells.size} value{overCapCells.size === 1 ? "" : "s"} over the allowed mark — fix before submitting
            </Badge>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmReapproval}
        onOpenChange={setConfirmReapproval}
        title="Re-approval required"
        description={`${approvedTouchedCount} of your pending change(s) touch mark(s) that were already approved. Saving will revert ${approvedTouchedCount === 1 ? "it" : "them"} back to Submitted, and ${approvedTouchedCount === 1 ? "it" : "they"} will need to be re-approved before results can be published. Continue?`}
        confirmLabel="Continue"
        loading={submitMutation.isPending}
        onConfirm={() => {
          setConfirmReapproval(false);
          submitMutation.mutate();
        }}
      />
    </PageWrapper>
  );
}
