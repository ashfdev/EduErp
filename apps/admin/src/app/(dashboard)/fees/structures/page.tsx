"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, MultiSelectChecklist, ConfirmDialog, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

interface ClassOption { id: string; name_en: string }
interface SubCategoryOption { id: string; category: string; name: string }
interface FeeStructure {
  id: string;
  name: string;
  category: string;
  fee_sub_category: { id: string; name: string } | null;
  amount: number;
  frequency: string;
  due_day: number | null;
  class_id: string | null;
  classes: { class: { id: string; name_en: string } }[];
}
interface YearOption { id: string; label: string; is_active: boolean }

const emptyForm = { name: "", category: "TUITION", fee_sub_category_id: "", amount: 0, frequency: "MONTHLY", due_day: 10 };

export default function FeeStructuresPage() {
  const queryClient = useQueryClient();
  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const activeYear = years?.find((y) => y.is_active) ?? years?.[0];

  const { data: structures } = useQuery<FeeStructure[]>({
    queryKey: ["fees", "structures", activeYear?.id],
    queryFn: async () => (await api.get("/api/fees/structures", { params: { academic_year_id: activeYear?.id } })).data.data,
    enabled: !!activeYear,
  });
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: subCategories } = useQuery<SubCategoryOption[]>({ queryKey: ["fees", "sub-categories"], queryFn: async () => (await api.get("/api/fees/sub-categories", { params: { active_only: "true" } })).data.data });

  const relevantSubCategories = (category: string) => subCategories?.filter((s) => s.category === category) ?? [];

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s: FeeStructure) => {
    setEditingId(s.id);
    setForm({ name: s.name, category: s.category, fee_sub_category_id: s.fee_sub_category?.id ?? "", amount: s.amount, frequency: s.frequency, due_day: s.due_day ?? 10 });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { ...form, fee_sub_category_id: form.fee_sub_category_id || null, academic_year_id: activeYear?.id };
      return editingId ? api.put(`/api/fees/structures/${editingId}`, body) : api.post("/api/fees/structures", body);
    },
    onSuccess: () => {
      toast.success(editingId ? "Fee structure updated" : "Fee structure created");
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
      setOpen(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save fee structure"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/fees/structures/${id}`),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
    },
    onError: () => toast.error("This structure has invoices generated and cannot be deleted"),
  });

  // Assign to Classes dialog
  const [classesTarget, setClassesTarget] = useState<FeeStructure | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [overlapMessage, setOverlapMessage] = useState<string | null>(null);

  const openAssignClasses = (s: FeeStructure) => {
    setClassesTarget(s);
    setSelectedClassIds(s.classes.map((c) => c.class.id));
  };

  const assignClassesMutation = useMutation({
    mutationFn: (override?: boolean) => api.put(`/api/fees/structures/${classesTarget!.id}/classes`, { class_ids: selectedClassIds, override_overlap: override }),
    onSuccess: () => {
      toast.success("Classes assigned");
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
      setClassesTarget(null);
    },
    onError: (err: unknown) => {
      const error = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
      if (error?.code === "FEE_STRUCTURE_CLASS_OVERLAP") {
        setOverlapMessage(error.message ?? "One or more selected classes already have an active structure for this category.");
        return;
      }
      toast.error(error?.message ?? "Failed to assign classes");
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Fee Structures" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Structures" }]} action={<Button onClick={openCreate}>+ Add Fee Structure</Button>} />

      {!structures?.length && <EmptyState title="No fee structures yet" />}
      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Name</th><th className="p-2">Category</th><th className="p-2">Sub-Category</th><th className="p-2">Amount</th>
                <th className="p-2">Frequency</th><th className="p-2">Classes</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {structures?.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="p-2">{s.name}</td>
                  <td className="p-2"><Badge variant="outline">{s.category}</Badge></td>
                  <td className="p-2 text-muted-foreground">{s.fee_sub_category?.name ?? "—"}</td>
                  <td className="p-2">৳{s.amount}</td>
                  <td className="p-2">{s.frequency}</td>
                  <td className="p-2 text-muted-foreground">
                    {s.classes.length ? s.classes.map((c) => c.class.name_en).join(", ") : (s.class_id ? "1 class (legacy)" : "All classes")}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openAssignClasses(s)}>Assign to Classes</Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Fee Structure" : "Add Fee Structure"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly Tuition Fee" /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, fee_sub_category_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fee Sub-Category (optional)</Label>
              <Select value={form.fee_sub_category_id || "__none__"} onValueChange={(v) => setForm({ ...form, fee_sub_category_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {relevantSubCategories(form.category).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="ONE_TIME">One Time</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Due Day of Month</Label><Input type="number" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: Number(e.target.value) })} /></div>
            <p className="text-xs text-muted-foreground">Use &quot;Assign to Classes&quot; from the list to scope this structure to one or more classes.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!classesTarget} onOpenChange={(v) => !v && setClassesTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Classes — {classesTarget?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            When classes are assigned here, they take over from this structure&apos;s legacy single-class scoping. Section-level narrowing isn&apos;t supported for a multi-class assignment.
          </p>
          <MultiSelectChecklist
            options={(classes ?? []).map((c) => ({ id: c.id, label: c.name_en }))}
            selected={selectedClassIds}
            onChange={setSelectedClassIds}
          />
          <DialogFooter>
            <Button disabled={!selectedClassIds.length || assignClassesMutation.isPending} onClick={() => assignClassesMutation.mutate(undefined)}>
              {assignClassesMutation.isPending ? "Saving..." : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!overlapMessage}
        onOpenChange={(open) => !open && setOverlapMessage(null)}
        title="Classes already assigned elsewhere"
        description={overlapMessage ?? undefined}
        confirmLabel="Continue anyway"
        loading={assignClassesMutation.isPending}
        onConfirm={() => {
          setOverlapMessage(null);
          assignClassesMutation.mutate(true);
        }}
      />
    </PageWrapper>
  );
}
