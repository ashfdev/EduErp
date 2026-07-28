"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface MarkComponent {
  key: string;
  label: string;
  max_marks: number;
  source_type: "MANUAL" | "ATTENDANCE_PERCENTAGE" | "AVERAGE_OF_EXAMS";
}
interface ComponentFetchEntry {
  value: number | null;
  annotation: string | null;
}
interface Subject {
  id: string;
  name_en: string;
  config?: { full_marks_theory: number; full_marks_practical: number };
  mark_components?: MarkComponent[];
  editable: boolean;
  // NONE/PENDING/APPROVED_ACTIVE/REJECTED/REVOKED/EXPIRED — only meaningful
  // once the exam is COMPLETED (Plan Fourteen, Phase M).
  correction_status: string;
}
interface MarkEntryData {
  entry_deadline_info: { is_open: boolean; closes_at: string | null };
  subjects: Subject[];
  students: {
    id: string;
    name_en: string;
    current_roll_no: string | null;
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
}

export default function TeacherMarkEntryGridPage() {
  const { exam_id, class_id, section_id } = useParams<{ exam_id: string; class_id: string; section_id: string }>();
  const queryClient = useQueryClient();
  const t = useTranslations("marksGrid");

  const {
    data,
    isError,
    error,
  } = useQuery<MarkEntryData>({
    queryKey: ["marks", exam_id, class_id, section_id],
    queryFn: async () => (await api.get(`/api/marks/${exam_id}/${class_id}/${section_id}`)).data.data,
    retry: false,
  });
  const loadErrorMessage = (error as { response?: { data?: { error?: { message?: string } } } } | null)?.response?.data?.error?.message;

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

  function key(studentId: string, subjectId: string) {
    return `${studentId}:${subjectId}`;
  }

  // The `max` HTML attribute on a plain number input enforces nothing on its
  // own — no native form submission happens here, so a value over cap was
  // previously invisible until the server rejected the whole submit. See
  // the identical helper in apps/admin's copy of this page.
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

  function entryStatus(studentId: string, subjectId: string): string | undefined {
    return data?.students.find((s) => s.id === studentId)?.marks[subjectId]?.status;
  }

  function isEnrolled(studentId: string, subjectId: string): boolean {
    return !!data?.students.find((s) => s.id === studentId)?.enrolled_subject_ids.includes(subjectId);
  }

  // A subject stays editable once the exam is COMPLETED only if this
  // specific teacher has an approved, still-active correction for it
  // (Plan Fourteen, Phase M) — mirrors the exact server-side gate in
  // POST /marks/submit, so the UI never offers an input that would fail.
  function effectiveEditable(s: Subject): boolean {
    if (!s.editable) return false;
    if (exam?.status === "COMPLETED") return s.correction_status === "APPROVED_ACTIVE";
    return true;
  }

  const [correctionTarget, setCorrectionTarget] = useState<Subject | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const requestCorrectionMutation = useMutation({
    mutationFn: () =>
      api.post("/api/mark-corrections", { exam_id, subject_id: correctionTarget!.id, section_id, reason: correctionReason }),
    onSuccess: () => {
      toast.success(t("correctionRequested"));
      setCorrectionTarget(null);
      setCorrectionReason("");
      queryClient.invalidateQueries({ queryKey: ["marks", exam_id, class_id, section_id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? t("correctionRequestFailed")),
  });

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
      toast.success(t("marksSubmitted"));
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["marks", exam_id, class_id, section_id] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? t("submitFailed");
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

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader
          title={exam?.name ?? t("title")}
          subtitle={`${klass?.name_en ?? "…"} · ${section?.name ?? "…"} — ${
            isError ? t("loadError") : data ? (data.entry_deadline_info.is_open ? t("entryOpen") : t("entryClosed")) : t("loading")
          }`}
          breadcrumbs={[{ label: "Marks", href: "/marks" }, ...(exam ? [{ label: exam.name }] : []), ...(klass && section ? [{ label: `${klass.name_en} · ${section.name}` }] : [])]}
        />

        {isError && (
          <Card>
            <CardContent className="pt-6 text-sm text-destructive">{loadErrorMessage ?? t("loadErrorDetail")}</CardContent>
          </Card>
        )}

        {data && !data.subjects.length && <p className="text-sm text-muted-foreground">{t("noSubjects")}</p>}

        {data && data.subjects.length > 0 && !data.students.length && (
          <p className="text-sm text-muted-foreground">{t("noStudents")}</p>
        )}

        {data && data.subjects.length > 0 && data.students.length > 0 && (
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">{t("colRoll")}</th>
                    <th className="p-2">{t("colName")}</th>
                    {data.subjects.map((s) => (
                      <th key={s.id} className="p-2 min-w-[200px]">
                        {s.name_en} <span className="text-xs">/{(s.config?.full_marks_theory ?? 0) + (s.config?.full_marks_practical ?? 0)}</span>
                        {!s.editable && (
                          <span className="ml-1 text-[10px] font-normal normal-case text-muted-foreground">({t("viewOnlyColumn")})</span>
                        )}
                        {s.editable && exam?.status === "COMPLETED" && (
                          <div className="mt-1">
                            {s.correction_status === "APPROVED_ACTIVE" && (
                              <Badge variant="success" className="text-[10px] font-normal normal-case">{t("correctionApprovedActive")}</Badge>
                            )}
                            {s.correction_status === "PENDING" && (
                              <Badge variant="warning" className="text-[10px] font-normal normal-case">{t("correctionRequestedBadge")}</Badge>
                            )}
                            {(s.correction_status === "NONE" || s.correction_status === "REJECTED" || s.correction_status === "REVOKED" || s.correction_status === "EXPIRED") && (
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] font-normal normal-case" onClick={() => setCorrectionTarget(s)}>
                                {t("lockedRequestCorrection")}
                              </Button>
                            )}
                          </div>
                        )}
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
                              <span>{t("theoryLabel", { max: s.config.full_marks_theory })}</span>
                              <span>{t("practicalLabel", { max: s.config.full_marks_practical })}</span>
                            </div>
                          )
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((st) => (
                    <tr key={st.id} className="border-b">
                      <td className="p-2">{st.current_roll_no}</td>
                      <td className="p-2">{st.name_en}</td>
                      {data.subjects.map((s) => {
                        const enrolled = isEnrolled(st.id, s.id);
                        if (!enrolled) {
                          return (
                            <td key={s.id} className="p-1 text-center">
                              <span className="text-muted-foreground" title="Not enrolled in this subject">—</span>
                            </td>
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
                          <td key={s.id} className="p-1 align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              {status === "APPROVED" && <Badge variant="success" title={t("approvedBadgeTitle")}>✓</Badge>}
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
                                            isAutoUnedited
                                              ? t("componentAutoTitle", { label: comp.label, max: comp.max_marks })
                                              : t("componentTitle", { label: comp.label, max: comp.max_marks })
                                          }
                                          className={`h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                                            isOverCap ? "border-red-500 bg-red-50 text-red-700" : isAutoUnedited ? "border-dashed text-muted-foreground" : ""
                                          }`}
                                          disabled={!effectiveEditable(s) || v.is_absent}
                                          value={entry?.value ?? ""}
                                          onChange={(e) => setComponentValue(st.id, s.id, comp.key, e.target.value)}
                                        />
                                        {isOverCap && <span className="text-[9px] font-medium text-red-600">Max {comp.max_marks}</span>}
                                      </div>
                                    );
                                  })}
                                  <span className={`text-xs font-medium ${(componentSum ?? 0) > subjectTotal ? "text-red-600" : "text-muted-foreground"}`}>
                                    {t("componentTotalLabel", { total: componentSum, subjectTotal })}
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
                                          title={s.config ? t("theoryOutOf", { max: s.config.full_marks_theory }) : undefined}
                                          className={`h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${theoryOverCap ? "border-red-500 bg-red-50 text-red-700" : ""}`}
                                          disabled={!effectiveEditable(s) || v.is_absent}
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
                                            title={t("practicalOutOf", { max: s.config.full_marks_practical })}
                                            className={`h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${practicalOverCap ? "border-red-500 bg-red-50 text-red-700" : ""}`}
                                            disabled={!effectiveEditable(s) || v.is_absent}
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
                                  disabled={!effectiveEditable(s)}
                                  checked={v.is_absent ?? false}
                                  onCheckedChange={(checked) => setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, is_absent: checked === true } }))}
                                />
                                {t("absentShort")}
                              </label>
                            </div>
                            {annotations.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {annotations.map((a, i) => (
                                  <p key={i} className="text-[10px] leading-tight text-red-600">{a}</p>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {data && data.subjects.length > 0 && data.students.length > 0 && !data.subjects.some(effectiveEditable) && (
          <p className="text-sm text-muted-foreground">{t("readOnlyNote")}</p>
        )}

        {data && data.subjects.length > 0 && data.students.length > 0 && data.subjects.some(effectiveEditable) && (
          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={submitMutation.isPending || !Object.keys(edits).length || overCapCells.size > 0}>
              {submitMutation.isPending ? t("submitting") : t("submitMarks")}
            </Button>
            <Badge variant="outline">{t("pendingChanges", { count: Object.keys(edits).length })}</Badge>
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
          title={t("confirmRevertTitle")}
          description={t("confirmRevertApproved", { count: approvedTouchedCount })}
          confirmLabel={t("continue")}
          loading={submitMutation.isPending}
          onConfirm={() => {
            setConfirmReapproval(false);
            submitMutation.mutate();
          }}
        />

        <Dialog open={correctionTarget !== null} onOpenChange={(open) => !open && setCorrectionTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("requestCorrectionTitle", { subject: correctionTarget?.name_en ?? "" })}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{t("requestCorrectionHelp")}</p>
            <div className="space-y-1.5">
              <Label>{t("reasonLabel")}</Label>
              <Textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button onClick={() => requestCorrectionMutation.mutate()} disabled={requestCorrectionMutation.isPending || !correctionReason.trim()}>
                {requestCorrectionMutation.isPending ? t("submitting") : t("submitRequest")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageWrapper>
    </TeacherShell>
  );
}
