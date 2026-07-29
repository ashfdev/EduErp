"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Checkbox, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SubjectConfig {
  id: string;
  subject_id: string;
  full_marks_theory: number;
  full_marks_practical: number;
  pass_marks_theory: number;
  pass_marks_practical: number;
  pass_marks_combined: number;
  subject: { name_en: string; class: { id: string; name_en: string }; group: { name_en: string } | null };
}

type MarkComponentSourceType = "MANUAL" | "ATTENDANCE_PERCENTAGE" | "AVERAGE_OF_EXAMS";

interface MarkComponent {
  id: string;
  subject_id: string;
  key: string;
  label: string;
  max_marks: number;
  source_type: MarkComponentSourceType;
  source_exams: { source_exam_id: string }[];
  display_order: number;
}

interface Exam {
  id: string;
  name: string;
  status: string;
  academic_year_id: string;
  subject_configs: SubjectConfig[];
  mark_components: MarkComponent[];
}

// Plan Twenty-One, Phase B -- "Generate Exam Fee" reuses-or-creates an
// EXAM-category, ONE_TIME FeeStructure scoped to this exam's own classes,
// then calls the existing /invoices/generate route. Mirrors the same
// FeeStructure shape the Fee Structures page already works with.
interface ExamFeeStructure {
  id: string;
  name: string;
  category: string;
  frequency: string;
  amount: number;
  class_id: string | null;
  classes: { class: { id: string; name_en: string } }[];
}

interface MarkComponentDraftRow {
  key: string;
  label: string;
  max_marks: number;
  source_type: MarkComponentSourceType;
  source_exam_ids: string[];
}

interface ExamOption {
  id: string;
  name: string;
  academic_year: { label: string };
}

interface MarkCompositionTemplate {
  id: string;
  name: string;
  items: { key: string; label: string; max_marks: number; source_type: "MANUAL" | "ATTENDANCE_PERCENTAGE" }[];
}

const SOURCE_TYPE_LABELS: Record<MarkComponentSourceType, string> = {
  MANUAL: "Manual entry",
  ATTENDANCE_PERCENTAGE: "Auto — Attendance %",
  AVERAGE_OF_EXAMS: "Auto — average from specific exam(s)",
};

function slugifyKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "component";
}

const STAGES = ["DRAFT", "ACTIVE", "MARK_ENTRY", "COMPLETED", "PUBLISHED"] as const;
const STAGE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  MARK_ENTRY: "Mark Entry",
  COMPLETED: "Completed",
  PUBLISHED: "Published",
};

// The one manual, one-click transition per status — each with a real
// explanation of what it locks/unlocks, matching the "Reopen for
// Correction" button's already-good confirm-dialog precedent instead of a
// bare "Move to X" label. COMPLETED has no entry here: publishing is
// reached automatically once every class/group's results are approved and
// published on the Marks page (see the dedicated notice rendered for that
// status below), not by a manual click on this page.
const STATUS_TRANSITIONS: Record<string, { next: string; label: string; confirm: string } | undefined> = {
  DRAFT: { next: "ACTIVE", label: "Activate Exam", confirm: "Activate this exam? Subject configuration stays editable until you open Mark Entry." },
  ACTIVE: { next: "MARK_ENTRY", label: "Open Mark Entry", confirm: "Open Mark Entry for this exam? Teachers can start submitting marks, and subject configuration will be locked." },
  MARK_ENTRY: { next: "COMPLETED", label: "Mark as Completed", confirm: "Mark this exam as Completed? This closes Mark Entry — use \"Reopen for Correction\" afterward if a mark needs fixing." },
};

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: exam } = useQuery<Exam>({
    queryKey: ["exams", id],
    queryFn: async () => (await api.get(`/api/exams/${id}`)).data.data,
  });

  // Candidate source exams for AVERAGE_OF_EXAMS — every other exam in the
  // system (excluding this one), picked directly by name rather than by a
  // shared "type" category.
  const { data: allExams } = useQuery<ExamOption[]>({
    queryKey: ["exams", "all"],
    queryFn: async () => (await api.get("/api/exams")).data.data,
  });
  const otherExams = (allExams ?? []).filter((e) => e.id !== id);

  const { data: templates } = useQuery<MarkCompositionTemplate[]>({
    queryKey: ["settings", "mark-composition-templates"],
    queryFn: async () => (await api.get("/api/settings/mark-composition-templates")).data.data,
  });

  const [configs, setConfigs] = useState<Record<string, SubjectConfig> | null>(null);
  const effectiveConfigs = configs ?? Object.fromEntries((exam?.subject_configs ?? []).map((c) => [c.subject_id, c]));
  // Purely a view filter — Save Configuration always submits every class's
  // rows regardless of which tab is selected, since effectiveConfigs
  // already holds the full set.
  const [selectedClass, setSelectedClass] = useState<string>("");
  const classNames = [...new Set(Object.values(effectiveConfigs).map((c) => c.subject.class.name_en))].sort();
  const visibleConfigs = Object.values(effectiveConfigs).filter((c) => !selectedClass || c.subject.class.name_en === selectedClass);

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.put(`/api/exams/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
    onError: () => toast.error("Invalid status transition"),
  });

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/api/exams/${id}/reopen`),
    onSuccess: () => {
      toast.success("Exam reopened for mark correction");
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to reopen exam";
      toast.error(message);
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/exams/${id}/subject-config`, Object.values(effectiveConfigs).map((c) => ({
        subject_id: c.subject_id,
        full_marks_theory: c.full_marks_theory,
        full_marks_practical: c.full_marks_practical,
        pass_marks_theory: c.pass_marks_theory,
        pass_marks_practical: c.pass_marks_practical,
        pass_marks_combined: c.pass_marks_combined,
      }))),
    onSuccess: () => {
      toast.success("Subject configuration saved");
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
  });

  // Total Marks maps directly onto full_marks_theory; full_marks_practical
  // stays at whatever it already is (0 for any subject using the simple
  // flow) — the dual Theory/Practical split still exists at the schema/API
  // level for a future BD-board-specific screen, just not surfaced here.
  function updateTotalMarks(subjectId: string, value: number) {
    setConfigs({ ...effectiveConfigs, [subjectId]: { ...effectiveConfigs[subjectId]!, full_marks_theory: value } });
  }
  function updatePassMarks(subjectId: string, value: number) {
    setConfigs({ ...effectiveConfigs, [subjectId]: { ...effectiveConfigs[subjectId]!, pass_marks_combined: value } });
  }

  const [markCompSubjectId, setMarkCompSubjectId] = useState<string | null>(null);
  const [markCompDraft, setMarkCompDraft] = useState<MarkComponentDraftRow[]>([]);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmTransition, setConfirmTransition] = useState(false);
  const canEditMarkComposition = exam?.status === "DRAFT" || exam?.status === "ACTIVE";

  function openMarkCompositionEditor(subjectId: string) {
    const existing = (exam?.mark_components ?? [])
      .filter((c) => c.subject_id === subjectId)
      .sort((a, b) => a.display_order - b.display_order)
      .map((c) => ({ key: c.key, label: c.label, max_marks: c.max_marks, source_type: c.source_type, source_exam_ids: c.source_exams.map((se) => se.source_exam_id) }));
    setMarkCompDraft(existing);
    setMarkCompSubjectId(subjectId);
  }

  function updateMarkCompRow(i: number, patch: Partial<MarkComponentDraftRow>) {
    setMarkCompDraft((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function toggleSourceExam(i: number, examId: string, checked: boolean) {
    setMarkCompDraft((prev) =>
      prev.map((row, idx) =>
        idx === i
          ? { ...row, source_exam_ids: checked ? [...row.source_exam_ids, examId] : row.source_exam_ids.filter((eid) => eid !== examId) }
          : row,
      ),
    );
  }

  function applyTemplate(templateId: string) {
    const template = templates?.find((t) => t.id === templateId);
    if (!template) return;
    setMarkCompDraft(template.items.map((it) => ({ ...it, source_exam_ids: [] })));
  }

  const saveMarkComponentsMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/exams/${id}/subject-config/${markCompSubjectId}/mark-components`, {
        components: markCompDraft.map((c, i) => ({ ...c, display_order: i })),
      }),
    onSuccess: () => {
      toast.success("Mark composition saved");
      setMarkCompSubjectId(null);
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save mark composition"),
  });

  const markCompSubject = Object.values(effectiveConfigs).find((c) => c.subject_id === markCompSubjectId);
  const markCompSubjectTotal = markCompSubject ? markCompSubject.full_marks_theory + markCompSubject.full_marks_practical : 0;
  const markCompDraftTotal = Math.round(markCompDraft.reduce((sum, c) => sum + (c.max_marks || 0), 0) * 100) / 100;

  // Bulk-apply a saved template to several subjects at once — the earlier
  // per-subject "Apply Template" dropdown only ever pre-filled one subject's
  // own dialog draft; this is a real, separate bulk action against the
  // backend, not a client-side loop over the single-subject save route.
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState("");

  function toggleBulkSelected(subjectId: string, checked: boolean) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(subjectId);
      else next.delete(subjectId);
      return next;
    });
  }

  const allVisibleSelected = visibleConfigs.length > 0 && visibleConfigs.every((c) => bulkSelected.has(c.subject_id));

  const bulkApplyMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/exams/${id}/subject-config/bulk-mark-components`, {
        subject_ids: [...bulkSelected],
        template_id: bulkTemplateId,
      }),
    onSuccess: (res) => {
      const { applied, skipped } = res.data.data as {
        applied: { subject_id: string; subject_name: string }[];
        skipped: { subject_id: string; subject_name: string; reason: string }[];
      };
      if (applied.length) toast.success(`Applied to ${applied.length} subject${applied.length === 1 ? "" : "s"}: ${applied.map((a) => a.subject_name).join(", ")}`);
      if (skipped.length) {
        toast.error(
          `Skipped ${skipped.length} subject${skipped.length === 1 ? "" : "s"}: ${skipped.map((s) => `${s.subject_name} (${s.reason})`).join("; ")}`,
          { duration: 10000 },
        );
      }
      setBulkTemplateOpen(false);
      setBulkTemplateId("");
      setBulkSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to bulk-apply template"),
  });

  // "Generate Exam Fee" (Plan Twenty-One, Phase B) -- an explicit, deliberate
  // admin action (never auto-triggered), matching the plan's own framing:
  // exam-fee amounts/timing need real admin judgment, unlike calendar-driven
  // monthly tuition. Reuses an existing EXAM-category ONE_TIME FeeStructure
  // already scoped to this exam's classes, or creates one inline scoped to
  // exactly this exam's class list, then bulk-generates via the existing,
  // unchanged POST /invoices/generate route -- same idempotency guarantee
  // that route already has.
  const examClassIds = [...new Set(Object.values(effectiveConfigs).map((c) => c.subject.class.id))];

  const [examFeeOpen, setExamFeeOpen] = useState(false);
  const [examFeeMode, setExamFeeMode] = useState<"existing" | "new">("new");
  const [examFeeStructureId, setExamFeeStructureId] = useState("");
  const [examFeeName, setExamFeeName] = useState("");
  const [examFeeAmount, setExamFeeAmount] = useState(0);
  const [examFeeOverlapMessage, setExamFeeOverlapMessage] = useState<string | null>(null);
  // Tracks a just-created structure across an overlap-confirm retry, so
  // re-submitting with override=true reuses it instead of creating a
  // second, orphaned duplicate.
  const [examFeePendingStructureId, setExamFeePendingStructureId] = useState<string | null>(null);
  // Explicit, required due date -- without this, /invoices/generate falls
  // back to "the structure's due_day in whichever month you happen to
  // click Generate in," which isn't a meaningful exam-fee deadline.
  const [examFeeDueDate, setExamFeeDueDate] = useState("");

  function openExamFeeDialog() {
    setExamFeeMode("new");
    setExamFeeStructureId("");
    setExamFeeName(exam ? `${exam.name} — Exam Fee` : "Exam Fee");
    setExamFeeAmount(0);
    setExamFeePendingStructureId(null);
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setExamFeeDueDate(d.toISOString().slice(0, 10));
    setExamFeeOpen(true);
  }

  const { data: examFeeStructures } = useQuery<ExamFeeStructure[]>({
    queryKey: ["fees", "structures", "for-exam", exam?.academic_year_id],
    queryFn: async () => (await api.get("/api/fees/structures", { params: { academic_year_id: exam!.academic_year_id } })).data.data,
    enabled: examFeeOpen && !!exam,
  });
  const existingExamFeeOptions = (examFeeStructures ?? []).filter((s) => s.category === "EXAM" && s.frequency === "ONE_TIME");
  const selectedExistingStructure = existingExamFeeOptions.find((s) => s.id === examFeeStructureId);

  const examFeePreviewClassIds =
    examFeeMode === "new"
      ? examClassIds
      : selectedExistingStructure
        ? selectedExistingStructure.classes.length
          ? selectedExistingStructure.classes.map((c) => c.class.id)
          : selectedExistingStructure.class_id
            ? [selectedExistingStructure.class_id]
            : null
        : undefined;

  const { data: examFeePreviewTotal } = useQuery<number>({
    queryKey: ["students", "count-for-generate", "exam-fee", examFeePreviewClassIds?.join(",") ?? "none"],
    queryFn: async () => {
      const params: Record<string, string> = { status: "ACTIVE", limit: "1" };
      if (examFeePreviewClassIds) params.class_ids = examFeePreviewClassIds.join(",");
      return (await api.get("/api/students", { params })).data.meta.total as number;
    },
    enabled: examFeeOpen && examFeePreviewClassIds !== undefined,
  });

  const examFeeAmountForPreview = examFeeMode === "new" ? examFeeAmount : (selectedExistingStructure?.amount ?? 0);

  const generateExamFeeMutation = useMutation({
    mutationFn: async (overrideOverlap?: boolean) => {
      let structureId = examFeeMode === "existing" ? examFeeStructureId : examFeePendingStructureId;
      if (examFeeMode === "new" && !structureId) {
        const createdStructure = await api.post("/api/fees/structures", {
          academic_year_id: exam!.academic_year_id,
          category: "EXAM",
          frequency: "ONE_TIME",
          name: examFeeName,
          amount: examFeeAmount,
        });
        structureId = createdStructure.data.data.id;
        setExamFeePendingStructureId(structureId);
      }
      if (examFeeMode === "new") {
        await api.put(`/api/fees/structures/${structureId}/classes`, { class_ids: examClassIds, override_overlap: overrideOverlap });
      }
      return api.post("/api/fees/invoices/generate", { fee_structure_id: structureId, due_date: examFeeDueDate });
    },
    onSuccess: (res) => {
      const { created, skipped_duplicates } = res.data.data as { created: number; skipped_duplicates: number };
      toast.success(`Generated ${created} invoice${created === 1 ? "" : "s"}${skipped_duplicates ? ` (${skipped_duplicates} already existed)` : ""}`);
      setExamFeeOpen(false);
    },
    onError: (err: unknown) => {
      const error = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
      if (error?.code === "FEE_STRUCTURE_CLASS_OVERLAP") {
        setExamFeeOverlapMessage(error.message ?? "One or more classes already have an active EXAM fee structure.");
        return;
      }
      toast.error(error?.message ?? "Failed to generate exam fee invoices");
    },
  });

  if (!exam) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  const transition = STATUS_TRANSITIONS[exam.status];
  const currentStageIndex = STAGES.indexOf(exam.status as (typeof STAGES)[number]);

  return (
    <PageWrapper>
      <PageHeader
        title={exam.name}
        breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: exam.name }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openExamFeeDialog}>Generate Exam Fee</Button>
            <Link href={`/examination/${id}/seat-plan`}><Button variant="outline">Seat Plan</Button></Link>
            {exam.status === "COMPLETED" && (
              <>
                <Link href="/examination/mark-corrections"><Button variant="outline">Mark Corrections</Button></Link>
                <Button variant="outline" onClick={() => setConfirmReopen(true)} disabled={reopenMutation.isPending}>
                  Reopen for Correction
                </Button>
              </>
            )}
            {transition && (
              <Button onClick={() => setConfirmTransition(true)} disabled={statusMutation.isPending}>
                {transition.label}
              </Button>
            )}
          </div>
        }
      />

      {/* Stage legend — always-visible flow overview, not just per-click confirms */}
      <div className="flex items-center gap-1 text-xs">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                i === currentStageIndex
                  ? "bg-primary text-primary-foreground"
                  : i < currentStageIndex
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {STAGE_LABELS[s]}
            </span>
            {i < STAGES.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {exam.status === "COMPLETED" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This exam becomes <strong>Published</strong> automatically once every class&apos;s (and group&apos;s, if any) marks are
          approved and published — it&apos;s not a one-click action here.{" "}
          <Link href={`/marks/${id}/approve`} className="font-medium underline">
            Go to Approve & Publish →
          </Link>
        </p>
      )}

      {classNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={selectedClass === "" ? "default" : "outline"} onClick={() => setSelectedClass("")}>
            All Classes ({Object.values(effectiveConfigs).length})
          </Button>
          {classNames.map((cn) => (
            <Button key={cn} size="sm" variant={selectedClass === cn ? "default" : "outline"} onClick={() => setSelectedClass(cn)}>
              {cn} ({Object.values(effectiveConfigs).filter((c) => c.subject.class.name_en === cn).length})
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {!!templates?.length && canEditMarkComposition && (
            <div className="mb-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkSelected.size}
                onClick={() => setBulkTemplateOpen(true)}
              >
                Bulk Apply Template ({bulkSelected.size} selected)
              </Button>
              {!!bulkSelected.size && (
                <Button size="sm" variant="ghost" onClick={() => setBulkSelected(new Set())}>
                  Clear selection
                </Button>
              )}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(v) =>
                      setBulkSelected((prev) => {
                        const next = new Set(prev);
                        for (const c of visibleConfigs) {
                          if (v === true) next.add(c.subject_id);
                          else next.delete(c.subject_id);
                        }
                        return next;
                      })
                    }
                  />
                </TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Total Marks</TableHead>
                <TableHead>Pass Marks</TableHead>
                <TableHead>Mark Composition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleConfigs.map((c) => {
                const markCompCount = (exam.mark_components ?? []).filter((cc) => cc.subject_id === c.subject_id).length;
                return (
                  <TableRow key={c.subject_id}>
                    <TableCell>
                      <Checkbox
                        checked={bulkSelected.has(c.subject_id)}
                        onCheckedChange={(v) => toggleBulkSelected(c.subject_id, v === true)}
                      />
                    </TableCell>
                    <TableCell>{c.subject.name_en}</TableCell>
                    <TableCell className="text-muted-foreground">{c.subject.class.name_en}</TableCell>
                    <TableCell className="text-muted-foreground">{c.subject.group?.name_en ?? "—"}</TableCell>
                    <TableCell><Input type="number" className="h-8 w-24" value={c.full_marks_theory} onChange={(e) => updateTotalMarks(c.subject_id, Number(e.target.value))} /></TableCell>
                    <TableCell><Input type="number" className="h-8 w-24" value={c.pass_marks_combined} onChange={(e) => updatePassMarks(c.subject_id, Number(e.target.value))} /></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openMarkCompositionEditor(c.subject_id)}>
                        {markCompCount ? `${markCompCount} part(s)` : "Plain total"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Button className="mt-4" size="sm" onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending}>
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      <Dialog open={bulkTemplateOpen} onOpenChange={setBulkTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Apply Template — {bulkSelected.size} subject{bulkSelected.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Applies the chosen template&apos;s parts to every selected subject whose own total matches the
            template&apos;s total exactly. Any subject whose total doesn&apos;t match is skipped, not
            force-applied — you&apos;ll see which ones and why after.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={bulkTemplateId} onChange={(e) => setBulkTemplateId(e.target.value)}>
              <option value="">Choose a saved template…</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.items.reduce((sum, it) => sum + it.max_marks, 0)} marks)
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTemplateOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkApplyMutation.mutate()} disabled={!bulkTemplateId || bulkApplyMutation.isPending}>
              {bulkApplyMutation.isPending ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!markCompSubjectId} onOpenChange={(open) => !open && setMarkCompSubjectId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mark Composition — {markCompSubject?.subject.name_en}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Optionally split this subject&apos;s total ({markCompSubjectTotal} marks) into named, fixed-mark
            parts (e.g. Theory 60, MCQ 20, Practical 20). Leave empty for a single plain total, exactly as
            today. The parts must sum exactly to the subject&apos;s total. Teachers cannot enter more than
            each part&apos;s own cap.
          </p>

          {!!templates?.length && canEditMarkComposition && (
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Apply Template</Label>
              <select className="rounded-md border px-2 py-1 text-sm" value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)} disabled={!canEditMarkComposition}>
                <option value="">Choose a saved template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {!canEditMarkComposition && (
            <p className="text-sm text-amber-700">Mark composition can only be edited while the exam is Draft or Active.</p>
          )}

          <div className="space-y-3">
            {markCompDraft.map((row, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Label (e.g. Theory, MCQ, Practical, CT, Attendance)"
                    value={row.label}
                    onChange={(e) => updateMarkCompRow(i, { label: e.target.value, key: slugifyKey(e.target.value) })}
                    disabled={!canEditMarkComposition}
                  />
                  <Input
                    type="number"
                    className="w-24"
                    placeholder="Marks"
                    value={row.max_marks || ""}
                    onChange={(e) => updateMarkCompRow(i, { max_marks: Number(e.target.value) })}
                    disabled={!canEditMarkComposition}
                  />
                  <Button variant="outline" size="sm" onClick={() => setMarkCompDraft((prev) => prev.filter((_, idx) => idx !== i))} disabled={!canEditMarkComposition}>
                    Remove
                  </Button>
                </div>

                <div className="flex items-center gap-2 pl-1">
                  <Label className="text-xs shrink-0">Source</Label>
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={row.source_type}
                    onChange={(e) =>
                      updateMarkCompRow(i, {
                        source_type: e.target.value as MarkComponentSourceType,
                        source_exam_ids: e.target.value === "AVERAGE_OF_EXAMS" ? row.source_exam_ids : [],
                      })
                    }
                    disabled={!canEditMarkComposition}
                  >
                    {(Object.entries(SOURCE_TYPE_LABELS) as [MarkComponentSourceType, string][]).map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
                {row.source_type === "AVERAGE_OF_EXAMS" && (
                  <div className="pl-1 space-y-1">
                    <Label className="text-xs">Average from</Label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto rounded-md border p-2">
                      {otherExams.length === 0 && <p className="text-xs text-muted-foreground">No other exams exist yet.</p>}
                      {otherExams.map((e) => (
                        <label key={e.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                          <Checkbox
                            checked={row.source_exam_ids.includes(e.id)}
                            onCheckedChange={(v) => toggleSourceExam(i, e.id, v === true)}
                            disabled={!canEditMarkComposition}
                          />
                          {e.name} ({e.academic_year.label})
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMarkCompDraft((prev) => [...prev, { key: `component_${prev.length + 1}`, label: "", max_marks: 0, source_type: "MANUAL", source_exam_ids: [] }])}
              disabled={!canEditMarkComposition}
            >
              + Add Part
            </Button>

            {markCompDraft.length > 0 && (
              <p className={`text-sm ${markCompDraftTotal !== markCompSubjectTotal ? "text-red-600" : "text-muted-foreground"}`}>
                Total: {markCompDraftTotal} / Subject total: {markCompSubjectTotal}
                {markCompDraftTotal !== markCompSubjectTotal && " (must match exactly)"}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkCompSubjectId(null)}>Cancel</Button>
            <Button
              onClick={() => saveMarkComponentsMutation.mutate()}
              disabled={
                !canEditMarkComposition ||
                saveMarkComponentsMutation.isPending ||
                markCompDraft.some((r) => !r.label.trim()) ||
                markCompDraft.some((r) => r.source_type === "AVERAGE_OF_EXAMS" && r.source_exam_ids.length === 0)
              }
            >
              {saveMarkComponentsMutation.isPending ? "Saving..." : "Save Composition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmReopen}
        onOpenChange={setConfirmReopen}
        title="Reopen for Correction"
        description="Reopen this exam for mark correction? It will move back to Mark Entry status until marked Completed again."
        confirmLabel="Reopen"
        loading={reopenMutation.isPending}
        onConfirm={() => {
          setConfirmReopen(false);
          reopenMutation.mutate();
        }}
      />

      {transition && (
        <ConfirmDialog
          open={confirmTransition}
          onOpenChange={setConfirmTransition}
          title={transition.label}
          description={transition.confirm}
          confirmLabel={transition.label}
          loading={statusMutation.isPending}
          onConfirm={() => {
            setConfirmTransition(false);
            statusMutation.mutate(transition.next);
          }}
        />
      )}

      <Dialog open={examFeeOpen} onOpenChange={setExamFeeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Exam Fee — {exam.name}</DialogTitle></DialogHeader>
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Fee Structure</Label>
            <select
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              value={examFeeMode === "new" ? "__new__" : examFeeStructureId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setExamFeeMode("new");
                  setExamFeeStructureId("");
                } else {
                  setExamFeeMode("existing");
                  setExamFeeStructureId(e.target.value);
                }
              }}
            >
              <option value="__new__">+ Create new Exam Fee structure</option>
              {existingExamFeeOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name} (৳{s.amount})</option>
              ))}
            </select>
          </div>

          {examFeeMode === "new" && (
            <>
              <p className="text-sm text-muted-foreground">
                Creates a new EXAM-category, one-time fee scoped to exactly this exam&apos;s classes.
              </p>
              <div className="space-y-1.5"><Label>Name</Label><Input value={examFeeName} onChange={(e) => setExamFeeName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={examFeeAmount} onChange={(e) => setExamFeeAmount(Number(e.target.value))} /></div>
            </>
          )}

          {examFeeMode === "existing" && selectedExistingStructure && (
            <p className="text-sm text-muted-foreground">
              Applies to: {selectedExistingStructure.classes.length ? selectedExistingStructure.classes.map((c) => c.class.name_en).join(", ") : selectedExistingStructure.class_id ? "1 class" : "All classes institution-wide"}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={examFeeDueDate} onChange={(e) => setExamFeeDueDate(e.target.value)} />
          </div>

          <p className="text-sm">
            {examFeePreviewTotal === undefined ? (
              "Calculating..."
            ) : (
              <>
                Eligible: <strong>{examFeePreviewTotal}</strong> active student{examFeePreviewTotal === 1 ? "" : "s"} · Up to{" "}
                <strong>৳{(examFeePreviewTotal * examFeeAmountForPreview).toLocaleString()}</strong>
                <br />
                <span className="text-xs text-muted-foreground">
                  Students who already have this invoice are skipped automatically — this is an upper bound, not a guarantee of new charges.
                </span>
              </>
            )}
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExamFeeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => generateExamFeeMutation.mutate(undefined)}
              disabled={
                generateExamFeeMutation.isPending ||
                examFeePreviewTotal === undefined ||
                !examFeeDueDate ||
                (examFeeMode === "new" ? !examFeeName.trim() || examFeeAmount <= 0 : !examFeeStructureId)
              }
            >
              {generateExamFeeMutation.isPending ? "Generating..." : "Generate Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!examFeeOverlapMessage}
        onOpenChange={(open) => !open && setExamFeeOverlapMessage(null)}
        title="Classes already assigned elsewhere"
        description={examFeeOverlapMessage ?? undefined}
        confirmLabel="Continue anyway"
        loading={generateExamFeeMutation.isPending}
        onConfirm={() => {
          setExamFeeOverlapMessage(null);
          generateExamFeeMutation.mutate(true);
        }}
      />
    </PageWrapper>
  );
}
