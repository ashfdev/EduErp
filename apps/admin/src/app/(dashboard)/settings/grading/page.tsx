"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Label,
  EmptyState,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface GradeRange {
  id?: string;
  min_marks: number;
  max_marks: number;
  grade_letter: string;
  grade_point: number;
  remarks?: string;
  display_order: number;
}

interface GradingScale {
  id: string;
  name: string;
  scale_type: string;
  is_default: boolean;
  ranges: GradeRange[];
}

export default function GradingSettingsPage() {
  const queryClient = useQueryClient();
  const { data: scales } = useQuery<GradingScale[]>({
    queryKey: ["settings", "grading-scales"],
    queryFn: async () => (await api.get("/api/settings/grading-scales")).data.data,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [ranges, setRanges] = useState<GradeRange[]>([]);
  const [name, setName] = useState("");

  function openEditor(scale: GradingScale) {
    setEditingId(scale.id);
    setName(scale.name);
    setRanges(scale.ranges.map((r) => ({ ...r })));
  }

  function addRow() {
    setRanges((prev) => [...prev, { min_marks: 0, max_marks: 0, grade_letter: "", grade_point: 0, display_order: prev.length + 1 }]);
  }

  function updateRow(i: number, patch: Partial<GradeRange>) {
    setRanges((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRanges((prev) => prev.filter((_, idx) => idx !== i));
  }

  const saveRangesMutation = useMutation({
    mutationFn: () => api.put(`/api/settings/grading-scales/${editingId}/ranges`, { ranges }),
    onSuccess: () => {
      toast.success("Grade ranges saved");
      queryClient.invalidateQueries({ queryKey: ["settings", "grading-scales"] });
      setEditingId(null);
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: { details?: string[] } } } })?.response?.data?.error?.details?.join(", ") ??
        "Invalid grade ranges";
      toast.error(message);
    },
  });

  const presetMutation = useMutation({
    mutationFn: (preset: string) => api.post("/api/settings/grading-scales/presets/apply", { preset }),
    onSuccess: () => {
      toast.success("Preset applied as a new scale");
      queryClient.invalidateQueries({ queryKey: ["settings", "grading-scales"] });
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/settings/grading-scales/${id}/default`),
    onSuccess: () => {
      toast.success("Default scale updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "grading-scales"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/grading-scales/${id}`),
    onSuccess: () => {
      toast.success("Scale deleted");
      queryClient.invalidateQueries({ queryKey: ["settings", "grading-scales"] });
    },
    onError: () => toast.error("This scale is in use and cannot be deleted"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Grading System"
        subtitle="Manage grading scales and grade ranges"
        breadcrumbs={[{ label: "Settings" }, { label: "Grading" }]}
        action={
          <div className="flex gap-2">
            {["BD_BOARD", "CGPA_4", "CGPA_5", "PERCENTAGE"].map((p) => (
              <Button key={p} size="sm" variant="outline" onClick={() => presetMutation.mutate(p)}>
                Apply {p.replace("_", " ")}
              </Button>
            ))}
          </div>
        }
      />

      {!scales?.length && <EmptyState title="No grading scales yet" description="Apply a preset above to get started." />}

      <div className="grid grid-cols-3 gap-4">
        {scales?.map((scale) => (
          <Card key={scale.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{scale.name}</CardTitle>
                {scale.is_default && <Badge variant="success">Default</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{scale.scale_type} · {scale.ranges.length} grades</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditor(scale)}>Edit</Button>
                {!scale.is_default && (
                  <Button size="sm" variant="outline" onClick={() => defaultMutation.mutate(scale.id)}>Set Default</Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(scale.id)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingId && (
        <Card>
          <CardHeader><CardTitle>Editing: {name}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Min Marks</th>
                  <th className="p-2">Max Marks</th>
                  <th className="p-2">Grade</th>
                  <th className="p-2">GPA Point</th>
                  <th className="p-2">Remarks</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {ranges.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-1"><Input type="number" value={r.min_marks} onChange={(e) => updateRow(i, { min_marks: Number(e.target.value) })} className="h-8 w-24" /></td>
                    <td className="p-1"><Input type="number" value={r.max_marks} onChange={(e) => updateRow(i, { max_marks: Number(e.target.value) })} className="h-8 w-24" /></td>
                    <td className="p-1"><Input value={r.grade_letter} onChange={(e) => updateRow(i, { grade_letter: e.target.value })} className="h-8 w-20" /></td>
                    <td className="p-1"><Input type="number" step="0.1" value={r.grade_point} onChange={(e) => updateRow(i, { grade_point: Number(e.target.value) })} className="h-8 w-20" /></td>
                    <td className="p-1"><Input value={r.remarks ?? ""} onChange={(e) => updateRow(i, { remarks: e.target.value })} className="h-8" /></td>
                    <td className="p-1"><Button type="button" size="sm" variant="ghost" onClick={() => removeRow(i)}>✕</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>+ Add Grade Row</Button>
            <div className="flex gap-2">
              <Button onClick={() => saveRangesMutation.mutate()} disabled={saveRangesMutation.isPending}>
                {saveRangesMutation.isPending ? "Saving..." : "Save Ranges"}
              </Button>
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
