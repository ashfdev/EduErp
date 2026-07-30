"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Label,
  EmptyState,
  extractErrorMessage,
  ErrorState,
  LoadingSpinner,
} from "@education-erp/ui";
import { api } from "@/lib/api";

// Deliberately excludes AVERAGE_OF_EXAMS — a reusable template reapplied to
// a different exam/year must never silently point at a stale, specific
// past exam, so that source type is only ever configured directly on a
// real exam's mark component (examination/[id]/page.tsx), never here.
type SourceType = "MANUAL" | "ATTENDANCE_PERCENTAGE";

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  MANUAL: "Manual entry",
  ATTENDANCE_PERCENTAGE: "Auto — Attendance %",
};

interface TemplateItem {
  key: string;
  label: string;
  max_marks: number;
  source_type: SourceType;
}

interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
}

function slugifyKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "component";
}

export default function MarkCompositionTemplatesPage() {
  const queryClient = useQueryClient();
  const { data: templates, isLoading, isError, error, refetch } = useQuery<Template[]>({
    queryKey: ["settings", "mark-composition-templates"],
    queryFn: async () => (await api.get("/api/settings/mark-composition-templates")).data.data,
  });
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<TemplateItem[]>([]);

  function openCreate() {
    setEditingId("new");
    setName("");
    setItems([]);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setName(t.name);
    setItems(t.items.map((i) => ({ ...i })));
  }

  function addRow() {
    setItems((prev) => [...prev, { key: `component_${prev.length + 1}`, label: "", max_marks: 0, source_type: "MANUAL" }]);
  }

  function updateRow(i: number, patch: Partial<TemplateItem>) {
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name, items: items.map((it, i) => ({ ...it, display_order: i })) };
      return editingId === "new" ? api.post("/api/settings/mark-composition-templates", body) : api.put(`/api/settings/mark-composition-templates/${editingId}`, body);
    },
    onSuccess: () => {
      toast.success("Template saved");
      queryClient.invalidateQueries({ queryKey: ["settings", "mark-composition-templates"] });
      setEditingId(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save template"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/mark-composition-templates/${id}`),
    onSuccess: () => {
      toast.success("Template removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "mark-composition-templates"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove template"),
  });

  const total = Math.round(items.reduce((sum, it) => sum + (it.max_marks || 0), 0) * 100) / 100;

  return (
    <PageWrapper>
      <PageHeader
        title="Mark Composition Templates"
        subtitle="Reusable, named mark-composition lists (e.g. Theory 70 / MCQ 20 / Practical 10) — pick one by name when setting up any exam's subject."
        breadcrumbs={[{ label: "Settings" }, { label: "Mark Composition Templates" }]}
        action={<Button onClick={openCreate}>+ New Template</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load templates" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!templates?.length && <EmptyState title="No templates yet" description="Create one to reuse across exams and classes." />}

          <div className="grid grid-cols-3 gap-4">
            {templates?.map((t) => {
              const templateTotal = Math.round(t.items.reduce((sum, it) => sum + it.max_marks, 0) * 100) / 100;
              return (
                <Card key={t.id}>
                  <CardHeader><CardTitle className="text-base">{t.name}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t.items.map((it) => `${it.label} ${it.max_marks}`).join(" + ") || "No parts yet"}
                      {t.items.length > 0 && ` = ${templateTotal}`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(t)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(t.id)}>Delete</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {editingId && (
        <Card>
          <CardHeader><CardTitle>{editingId === "new" ? "New Template" : `Editing: ${name}`}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 max-w-sm">
              <Label>Template Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SSC Standard" />
            </div>

            <div className="space-y-2">
              {items.map((row, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Label (e.g. Theory, MCQ, Practical)"
                      value={row.label}
                      onChange={(e) => updateRow(i, { label: e.target.value, key: slugifyKey(e.target.value) })}
                    />
                    <Input
                      type="number"
                      className="w-24"
                      placeholder="Marks"
                      value={row.max_marks || ""}
                      onChange={(e) => updateRow(i, { max_marks: Number(e.target.value) })}
                    />
                    <Button variant="outline" size="sm" onClick={() => removeRow(i)}>Remove</Button>
                  </div>
                  <div className="flex items-center gap-2 pl-1">
                    <Label className="text-xs shrink-0">Source</Label>
                    <select
                      className="rounded-md border px-2 py-1 text-sm"
                      value={row.source_type}
                      onChange={(e) => updateRow(i, { source_type: e.target.value as SourceType })}
                    >
                      {(Object.entries(SOURCE_TYPE_LABELS) as [SourceType, string][]).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRow}>+ Add Part</Button>
              {items.length > 0 && <p className="text-sm text-muted-foreground">Total: {total}</p>}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !name.trim() || items.some((r) => !r.label.trim())}
              >
                {saveMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
