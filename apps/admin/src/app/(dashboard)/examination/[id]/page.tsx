"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface SubjectConfig {
  id: string;
  subject_id: string;
  full_marks_theory: number;
  full_marks_practical: number;
  pass_marks_theory: number;
  pass_marks_practical: number;
  pass_marks_combined: number;
  subject: { name_en: string; class: { name_en: string } };
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

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "ACTIVE",
  ACTIVE: "MARK_ENTRY",
  MARK_ENTRY: "COMPLETED",
  COMPLETED: "PUBLISHED",
  PUBLISHED: null,
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
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to reopen exam";
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
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to save components";
      toast.error(message);
    },
  });

  const componentDraftTotal = componentDraft.reduce((sum, c) => sum + (c.max_marks || 0), 0);
  const componentSubject = Object.values(effectiveConfigs).find((c) => c.subject_id === componentSubjectId);

  if (!exam) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  const next = NEXT_STATUS[exam.status];

  return (
    <PageWrapper>
      <PageHeader
        title={exam.name}
        breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: exam.name }]}
        action={
          <div className="flex gap-2">
            <Link href={`/examination/${id}/seat-plan`}><Button variant="outline">Seat Plan</Button></Link>
            {exam.status === "COMPLETED" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm("Reopen this exam for mark correction? It will move back to Mark Entry status until marked Completed again.")) {
                    reopenMutation.mutate();
                  }
                }}
                disabled={reopenMutation.isPending}
              >
                Reopen for Correction
              </Button>
            )}
            {next && <Button onClick={() => statusMutation.mutate(next)}>Move to {next.replace(/_/g, " ")}</Button>}
          </div>
        }
      />
      <StatusBadge status={exam.status} />

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Subject</th>
                <th className="p-2">Full (Theory)</th>
                <th className="p-2">Full (Practical)</th>
                <th className="p-2">Pass (Theory)</th>
                <th className="p-2">Pass (Practical)</th>
                <th className="p-2">Total Marks</th>
                <th className="p-2">Theory Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(effectiveConfigs).map((c) => {
                const componentCount = (exam.component_configs ?? []).filter((cc) => cc.subject_id === c.subject_id).length;
                return (
                  <tr key={c.subject_id} className="border-b">
                    <td className="p-2">{c.subject.name_en}</td>
                    <td className="p-1"><Input type="number" className="h-8 w-24" value={c.full_marks_theory} onChange={(e) => updateConfig(c.subject_id, { full_marks_theory: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input type="number" className="h-8 w-24" value={c.full_marks_practical} onChange={(e) => updateConfig(c.subject_id, { full_marks_practical: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input type="number" className="h-8 w-24" value={c.pass_marks_theory} onChange={(e) => updateConfig(c.subject_id, { pass_marks_theory: Number(e.target.value) })} /></td>
                    <td className="p-1"><Input type="number" className="h-8 w-24" value={c.pass_marks_practical} onChange={(e) => updateConfig(c.subject_id, { pass_marks_practical: Number(e.target.value) })} /></td>
                    <td className="p-2 font-medium">{c.full_marks_theory + c.full_marks_practical}</td>
                    <td className="p-1">
                      <Button size="sm" variant="outline" onClick={() => openComponentEditor(c.subject_id)}>
                        {componentCount ? `${componentCount} component(s)` : "Plain theory mark"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    </PageWrapper>
  );
}
