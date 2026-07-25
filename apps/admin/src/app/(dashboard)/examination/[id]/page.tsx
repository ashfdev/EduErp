"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SubjectConfig {
  id: string;
  subject_id: string;
  full_marks_theory: number;
  full_marks_practical: number;
  pass_marks_theory: number;
  pass_marks_practical: number;
  pass_marks_combined: number;
  subject: { name_en: string; class: { name_en: string }; group: { name_en: string } | null };
}

interface ComponentConfig {
  id: string;
  subject_id: string;
  key: string;
  label: string;
  max_marks: number;
  display_order: number;
}

interface Exam {
  id: string;
  name: string;
  status: string;
  subject_configs: SubjectConfig[];
  component_configs: ComponentConfig[];
}

interface ComponentDraftRow {
  key: string;
  label: string;
  max_marks: number;
}

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

  function updateConfig(subjectId: string, patch: Partial<SubjectConfig>) {
    setConfigs({ ...effectiveConfigs, [subjectId]: { ...effectiveConfigs[subjectId]!, ...patch } });
  }

  const [componentSubjectId, setComponentSubjectId] = useState<string | null>(null);
  const [componentDraft, setComponentDraft] = useState<ComponentDraftRow[]>([]);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmTransition, setConfirmTransition] = useState(false);

  function openComponentEditor(subjectId: string) {
    const existing = (exam?.component_configs ?? [])
      .filter((c) => c.subject_id === subjectId)
      .sort((a, b) => a.display_order - b.display_order)
      .map((c) => ({ key: c.key, label: c.label, max_marks: c.max_marks }));
    setComponentDraft(existing);
    setComponentSubjectId(subjectId);
  }

  const saveComponentsMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/exams/${id}/subject-config/${componentSubjectId}/components`, {
        components: componentDraft.map((c, i) => ({ ...c, display_order: i })),
      }),
    onSuccess: () => {
      toast.success("Components saved");
      setComponentSubjectId(null);
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to save components";
      toast.error(message);
    },
  });

  const componentDraftTotal = componentDraft.reduce((sum, c) => sum + (c.max_marks || 0), 0);
  const componentSubject = Object.values(effectiveConfigs).find((c) => c.subject_id === componentSubjectId);

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Full (Theory)</TableHead>
                <TableHead>Full (Practical)</TableHead>
                <TableHead>Pass (Theory)</TableHead>
                <TableHead>Pass (Practical)</TableHead>
                <TableHead>Total Marks</TableHead>
                <TableHead>Theory Breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleConfigs.map((c) => {
                const componentCount = (exam.component_configs ?? []).filter((cc) => cc.subject_id === c.subject_id).length;
                return (
                  <TableRow key={c.subject_id}>
                    <TableCell>{c.subject.name_en}</TableCell>
                    <TableCell className="text-muted-foreground">{c.subject.class.name_en}</TableCell>
                    <TableCell className="text-muted-foreground">{c.subject.group?.name_en ?? "—"}</TableCell>
                    <TableCell><Input type="number" className="h-8 w-24" value={c.full_marks_theory} onChange={(e) => updateConfig(c.subject_id, { full_marks_theory: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input type="number" className="h-8 w-24" value={c.full_marks_practical} onChange={(e) => updateConfig(c.subject_id, { full_marks_practical: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input type="number" className="h-8 w-24" value={c.pass_marks_theory} onChange={(e) => updateConfig(c.subject_id, { pass_marks_theory: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input type="number" className="h-8 w-24" value={c.pass_marks_practical} onChange={(e) => updateConfig(c.subject_id, { pass_marks_practical: Number(e.target.value) })} /></TableCell>
                    <TableCell className="font-medium">{c.full_marks_theory + c.full_marks_practical}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openComponentEditor(c.subject_id)}>
                        {componentCount ? `${componentCount} component(s)` : "Plain theory mark"}
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

      <Dialog open={!!componentSubjectId} onOpenChange={(open) => !open && setComponentSubjectId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Theory Mark Breakdown — {componentSubject?.subject.name_en}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Optionally split the theory mark into named components (assignment, quiz, mid-term, attendance, lab/viva,
            etc.). Leave empty to keep a single plain theory mark. When set, the theory mark is always the sum of
            these components.
          </p>

          <div className="space-y-2">
            {componentDraft.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {i === 0 && <Label className="text-xs">Label</Label>}
                  <Input
                    value={row.label}
                    placeholder="e.g. Assignment"
                    onChange={(e) =>
                      setComponentDraft((prev) => prev.map((r, idx) => (idx === i ? { ...r, label: e.target.value, key: slugifyKey(e.target.value) } : r)))
                    }
                  />
                </div>
                <div className="w-28 space-y-1">
                  {i === 0 && <Label className="text-xs">Max Marks</Label>}
                  <Input
                    type="number"
                    min={0}
                    value={row.max_marks}
                    onChange={(e) => setComponentDraft((prev) => prev.map((r, idx) => (idx === i ? { ...r, max_marks: Number(e.target.value) } : r)))}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setComponentDraft((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setComponentDraft((prev) => [...prev, { key: `component_${prev.length + 1}`, label: "", max_marks: 0 }])}
            >
              + Add Component
            </Button>
          </div>

          {componentDraft.length > 0 && componentSubject && (
            <p className={`text-sm ${componentDraftTotal > componentSubject.full_marks_theory ? "text-red-600" : "text-muted-foreground"}`}>
              Components total: {componentDraftTotal} / Theory full marks: {componentSubject.full_marks_theory}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setComponentSubjectId(null)}>Cancel</Button>
            <Button
              onClick={() => saveComponentsMutation.mutate()}
              disabled={saveComponentsMutation.isPending || componentDraft.some((r) => !r.label.trim())}
            >
              {saveComponentsMutation.isPending ? "Saving..." : "Save Components"}
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
    </PageWrapper>
  );
}
