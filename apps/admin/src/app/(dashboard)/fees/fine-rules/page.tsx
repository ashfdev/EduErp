"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Label, Badge, Switch, EmptyState, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Input, MultiSelectChecklist,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

interface YearOption { id: string; label: string; is_active: boolean }
interface ClassOption { id: string; name_en: string }
interface SubCategoryOption { id: string; category: string; name: string }
interface FineRule {
  id: string;
  academic_year_id: string;
  scope_mode: "CATEGORY_FINE" | "SUB_CATEGORY_FINE";
  fee_category: string;
  fee_sub_category: { id: string; name: string } | null;
  fine_value_type: "FIXED" | "PERCENTAGE";
  fine_value: number;
  applicable_for: "ALL_CLASSES" | "SPECIFIC_CLASSES";
  classes: { class: { id: string; name_en: string } }[];
  is_active: boolean;
}

const emptyForm = {
  academic_year_id: "",
  scope_mode: "CATEGORY_FINE" as "CATEGORY_FINE" | "SUB_CATEGORY_FINE",
  fee_category: "TUITION",
  fee_sub_category_id: "",
  fine_value_type: "FIXED" as "FIXED" | "PERCENTAGE",
  fine_value: "",
  applicable_for: "ALL_CLASSES" as "ALL_CLASSES" | "SPECIFIC_CLASSES",
  class_ids: [] as string[],
};

export default function FeeFineRulesPage() {
  const queryClient = useQueryClient();

  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: subCategories } = useQuery<SubCategoryOption[]>({ queryKey: ["fees", "sub-categories"], queryFn: async () => (await api.get("/api/fees/sub-categories", { params: { active_only: "true" } })).data.data });
  const { data: rules } = useQuery<FineRule[]>({ queryKey: ["fees", "fine-rules"], queryFn: async () => (await api.get("/api/fees/fine-rules")).data.data });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const relevantSubCategories = subCategories?.filter((s) => s.category === form.fee_category) ?? [];

  // Blocks the dialog's default close-on-outside-click/Escape once the admin
  // has actually started filling the form, so in-progress input is never
  // silently lost to a stray click or an unrelated background event —
  // requires the explicit Cancel/X action instead (Plan Fifteen, Phase E).
  const isDirty = form.academic_year_id !== "" || form.fine_value !== "" || form.class_ids.length > 0;

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/fine-rules", {
        academic_year_id: form.academic_year_id,
        scope_mode: form.scope_mode,
        fee_category: form.fee_category,
        fee_sub_category_id: form.scope_mode === "SUB_CATEGORY_FINE" ? form.fee_sub_category_id : undefined,
        fine_value_type: form.fine_value_type,
        fine_value: Number(form.fine_value),
        applicable_for: form.applicable_for,
        class_ids: form.applicable_for === "SPECIFIC_CLASSES" ? form.class_ids : [],
      }),
    onSuccess: () => {
      toast.success("Fine rule created");
      queryClient.invalidateQueries({ queryKey: ["fees", "fine-rules"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create fine rule"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.put(`/api/fees/fine-rules/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees", "fine-rules"] }),
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Fee Fine Rules"
        subtitle="Category/sub-category/class-scoped late-fee overrides — falls back to the global late fee setting when nothing matches"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Fine Rules" }]}
        action={<Button onClick={() => setOpen(true)}>+ Add Fine Rule</Button>}
      />

      {!rules?.length && <EmptyState title="No fine rules yet" description="Every invoice uses the global late fee setting (Fee Rules) until a rule is added here." />}
      {!!rules?.length && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Sub-Category</TableHead>
                  <TableHead>Fine</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="outline">{r.fee_category}</Badge></TableCell>
                    <TableCell>{r.fee_sub_category?.name ?? "—"}</TableCell>
                    <TableCell>{r.fine_value_type === "PERCENTAGE" ? `${r.fine_value}%` : `৳${r.fine_value}`}</TableCell>
                    <TableCell>
                      {r.applicable_for === "ALL_CLASSES" ? "All classes" : r.classes.map((c) => c.class.name_en).join(", ") || "—"}
                    </TableCell>
                    <TableCell>{r.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Switch checked={r.is_active} onCheckedChange={(v) => toggleActiveMutation.mutate({ id: r.id, is_active: v })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
        <DialogContent
          className="max-w-lg"
          onEscapeKeyDown={(e) => isDirty && e.preventDefault()}
          onPointerDownOutside={(e) => isDirty && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Add Fine Rule</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label>Session</Label>
              <Select value={form.academic_year_id} onValueChange={(v) => setForm({ ...form, academic_year_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select session..." /></SelectTrigger>
                <SelectContent>{years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Setup Fine For</Label>
              <Select value={form.scope_mode} onValueChange={(v) => setForm({ ...form, scope_mode: v as typeof form.scope_mode, fee_sub_category_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CATEGORY_FINE">Fee Category</SelectItem>
                  <SelectItem value="SUB_CATEGORY_FINE">Fee Sub-Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fee Category</Label>
              <Select value={form.fee_category} onValueChange={(v) => setForm({ ...form, fee_category: v, fee_sub_category_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {form.scope_mode === "SUB_CATEGORY_FINE" && (
              <div className="space-y-1.5">
                <Label>Fee Sub-Category</Label>
                <Select value={form.fee_sub_category_id} onValueChange={(v) => setForm({ ...form, fee_sub_category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select sub-category..." /></SelectTrigger>
                  <SelectContent>
                    {relevantSubCategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!relevantSubCategories.length && <p className="text-xs text-muted-foreground">No sub-categories defined for this fee category yet.</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fine In</Label>
                <Select value={form.fine_value_type} onValueChange={(v) => setForm({ ...form, fine_value_type: v as typeof form.fine_value_type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed Amount</SelectItem>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.fine_value_type === "PERCENTAGE" ? "Percentage (%)" : "Amount (৳)"}</Label>
                <Input type="number" value={form.fine_value} onChange={(e) => setForm({ ...form, fine_value: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Applicable For</Label>
              <Select value={form.applicable_for} onValueChange={(v) => setForm({ ...form, applicable_for: v as typeof form.applicable_for })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_CLASSES">All Classes</SelectItem>
                  <SelectItem value="SPECIFIC_CLASSES">Specific Classes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.applicable_for === "SPECIFIC_CLASSES" && (
              <div className="space-y-1.5">
                <Label>Select Classes</Label>
                <MultiSelectChecklist
                  options={(classes ?? []).map((c) => ({ id: c.id, label: c.name_en }))}
                  selected={form.class_ids}
                  onChange={(ids) => setForm({ ...form, class_ids: ids })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={
                !form.academic_year_id || !form.fine_value ||
                (form.scope_mode === "SUB_CATEGORY_FINE" && !form.fee_sub_category_id) ||
                (form.applicable_for === "SPECIFIC_CLASSES" && !form.class_ids.length) ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
