"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  MultiRecordPickerDialog,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface RosterStudent {
  id: string;
  name_en: string;
  student_uid: string;
  current_roll_no: string | null;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
}
interface SubCategoryOption {
  id: string;
  category: string;
  name: string;
}

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

// Bulk "Add One-Time Fee" / "Add Fine" -- the roster multi-select equivalent
// of the single-student ad-hoc actions already on the Collect Fee dialog,
// for cases like "fine every student in Class 9 Section A ৳100 for the
// same reason" instead of repeating the single-student flow N times.
export default function BulkFinePage() {
  const [mode, setMode] = useState<"fee" | "fine">("fine");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [category, setCategory] = useState("OTHER");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: subCategories } = useQuery<SubCategoryOption[]>({
    queryKey: ["fees", "sub-categories"],
    queryFn: async () => (await api.get("/api/fees/sub-categories", { params: { active_only: "true" } })).data.data,
  });
  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];
  const relevantSubCategories = subCategories?.filter((s) => s.category === category) ?? [];

  function toggle(s: RosterStudent) {
    setSelectedIds((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
    setSelectedLabels((prev) => ({ ...prev, [s.id]: `${s.name_en} (${s.student_uid})` }));
  }
  function removeSelected(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  const applyMutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/invoices/ad-hoc/bulk", {
        student_ids: selectedIds,
        category,
        fee_sub_category_id: subCategoryId || undefined,
        description,
        amount: Number(amount),
        due_date: dueDate || undefined,
        is_manual_fine: mode === "fine",
      }),
    onSuccess: (res) => {
      const { created, skipped } = res.data.data as { created: number; skipped: string[] };
      toast.success(`${mode === "fine" ? "Fine" : "Fee"} applied to ${created} student(s)${skipped.length ? ` — ${skipped.length} skipped` : ""}`);
      setSelectedIds([]);
      setSelectedLabels({});
      setDescription("");
      setAmount("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to apply"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Bulk Fee / Fine"
        subtitle="Apply the same one-time fee or fine to several students at once"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Bulk Fee / Fine" }]}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex gap-2">
            <Button type="button" variant={mode === "fee" ? "default" : "outline"} onClick={() => setMode("fee")}>One-Time Fee</Button>
            <Button type="button" variant={mode === "fine" ? "default" : "outline"} onClick={() => setMode("fine")}>Fine</Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubCategoryId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sub-Category (optional)</Label>
              <Select value={subCategoryId || "__none__"} onValueChange={(v) => setSubCategoryId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {relevantSubCategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{mode === "fine" ? "Reason" : "Description"}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={mode === "fine" ? "e.g. Late form submission" : "e.g. Field trip fee"} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Amount (৳)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Due Date (optional)</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>

          <div className="space-y-1.5">
            <Label>Students ({selectedIds.length} selected)</Label>
            {!!selectedIds.length && (
              <div className="flex flex-wrap gap-1.5">
                {selectedIds.map((id) => (
                  <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => removeSelected(id)} title="Click to remove">
                    {selectedLabels[id] ?? id} ✕
                  </Badge>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>Choose Students…</Button>
          </div>

          <Button
            disabled={!selectedIds.length || !description || !amount || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? "Applying..." : `Apply to ${selectedIds.length || ""} Student${selectedIds.length === 1 ? "" : "s"}`}
          </Button>
        </CardContent>
      </Card>

      <MultiRecordPickerDialog<RosterStudent>
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose Students"
        searchPlaceholder="Search by name or student ID..."
        getKey={(s) => s.id}
        selected={selectedIds}
        onToggle={toggle}
        filters={
          <>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">All Classes</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
              <option value="">All Sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        }
        fetchResults={async ({ search, page }) =>
          (
            await api.get("/api/students", {
              params: { search: search || undefined, class_id: classId || undefined, section_id: sectionId || undefined, page, limit: 10 },
            })
          ).data
        }
        renderRow={(s) => (
          <div>
            <p className="font-medium">{s.name_en}</p>
            <p className="text-xs text-muted-foreground">
              {s.student_uid}
              {s.current_class && ` · ${s.current_class.name_en}`}
              {s.current_section && ` ${s.current_section.name}`}
              {s.current_roll_no && ` · Roll ${s.current_roll_no}`}
            </p>
          </div>
        )}
        confirmLabel={`Done (${selectedIds.length} selected)`}
        onConfirm={() => setPickerOpen(false)}
      />
    </PageWrapper>
  );
}
