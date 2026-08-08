"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, ErrorState, Input, Label, LoadingSpinner, Badge, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, MultiSelectChecklist, ConfirmDialog, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

// Plain, short explanation of when/where each category actually gets
// charged -- categories aren't just labels, each one is read by a specific
// flow (or two) elsewhere in the system, and that mapping isn't otherwise
// visible from this page.
const CATEGORY_HELP: Record<string, string> = {
  ADMISSION: "Shown as a selectable fee when a NEW student is enrolled (online-admission Confirm & Enroll, or the manual Add Student wizard). For online applicants, this is separate from the Admission Cycle's own flat application fee — that one is collected at apply time, before this ever applies.",
  FORM: "Same as Admission Fee — selectable at enrollment for manually-added students. For online applicants, the Admission Cycle's own flat form fee (collected at apply time) is used instead, so this never double-charges an online applicant.",
  READMISSION: "Auto-charged automatically the moment a student is PROMOTED into a class this is assigned to — no selection needed, matches this exact class/group or it's skipped entirely (fee-neutral).",
  EXAM: "Not auto-charged. Use \"Generate Invoices\" below whenever you want (e.g. right before an exam) to bulk-charge every student in the assigned class(es)/group(s).",
  TUITION: "Shown as a selectable fee at enrollment, and included automatically by Bulk Monthly Invoice Generation (Fees → Invoices) every month for every student it applies to.",
  OTHER: "Shown as a selectable fee at enrollment. For a genuinely one-off, not-worth-cataloging charge, use \"+ Add One-Time Fee\" on the Fee Collection page instead.",
};

interface ClassOption { id: string; name_en: string; groups: { id: string; name_en: string }[]; sections?: { id: string; name: string }[] }
interface SubCategoryOption { id: string; category: string; name: string }
interface StudentOption { id: string; name_en: string; student_uid: string }
interface FeeStructure {
  id: string;
  name: string;
  category: string;
  fee_sub_category: { id: string; name: string } | null;
  amount: number;
  frequency: string;
  due_day: number | null;
  target_due_date: string | null;
  class_id: string | null;
  classes: { class: { id: string; name_en: string }; group: { id: string; name_en: string } | null }[];
  students: { student: { id: string; name_en: string; student_uid: string } }[];
}
interface YearOption { id: string; label: string; is_active: boolean }

const emptyForm = { name: "", category: "TUITION", fee_sub_category_id: "", amount: 0, frequency: "MONTHLY", due_day: 10, target_due_date: "" };

export default function FeeStructuresPage() {
  const queryClient = useQueryClient();
  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const activeYear = years?.find((y) => y.is_active) ?? years?.[0];

  const { data: structures, isLoading: structuresLoading, isError: structuresError, error: structuresErrorObj, refetch: refetchStructures } = useQuery<FeeStructure[]>({
    queryKey: ["fees", "structures", activeYear?.id],
    queryFn: async () => (await api.get("/api/fees/structures", { params: { academic_year_id: activeYear?.id } })).data.data,
    enabled: !!activeYear,
  });
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: subCategories } = useQuery<SubCategoryOption[]>({ queryKey: ["fees", "sub-categories"], queryFn: async () => (await api.get("/api/fees/sub-categories", { params: { active_only: "true" } })).data.data });

  const relevantSubCategories = (category: string) => subCategories?.filter((s) => s.category === category) ?? [];

  function describeScope(s: FeeStructure): string {
    const parts: string[] = [];
    if (s.classes.length) {
      const byClass = new Map<string, { name: string; groups: string[] }>();
      for (const c of s.classes) {
        const entry = byClass.get(c.class.id) ?? { name: c.class.name_en, groups: [] };
        if (c.group) entry.groups.push(c.group.name_en);
        byClass.set(c.class.id, entry);
      }
      parts.push([...byClass.values()].map((e) => (e.groups.length ? `${e.name} (${e.groups.join(", ")})` : e.name)).join(", "));
    } else if (s.class_id) {
      parts.push("1 class (legacy)");
    } else {
      parts.push("All classes");
    }
    if (s.students.length) parts.push(`${s.students.length} specific student${s.students.length === 1 ? "" : "s"}`);
    return parts.join(" + ");
  }

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s: FeeStructure) => {
    setEditingId(s.id);
    setForm({
      name: s.name, category: s.category, fee_sub_category_id: s.fee_sub_category?.id ?? "", amount: s.amount, frequency: s.frequency,
      due_day: s.due_day ?? 10, target_due_date: s.target_due_date ? s.target_due_date.slice(0, 10) : "",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        fee_sub_category_id: form.fee_sub_category_id || null,
        academic_year_id: activeYear?.id,
        target_due_date: form.target_due_date || null,
      };
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

  // Generate Invoices Now (Plan Twenty-One, Phase B) -- the generic,
  // category-agnostic bulk-generate action for any ONE_TIME structure
  // (exam fee, a one-off development levy, a field-trip charge, etc.),
  // reusing the existing /invoices/generate route as-is. MONTHLY structures
  // keep using the separate scheduled/bulk-monthly path on the Invoices
  // page -- deliberately not offered here, since generating a MONTHLY
  // structure through this month/year-less route would key its idempotency
  // check on month:null/year:null, a different (and colliding) slot than
  // the real monthly invoices already use.
  const [generateTarget, setGenerateTarget] = useState<FeeStructure | null>(null);
  // Explicit, required due date -- without this, /invoices/generate falls
  // back to "the structure's due_day in whichever month you happen to
  // click Generate in," which is meaningless for a ONE_TIME fee. Defaults
  // to 14 days out, editable before generating.
  const [generateDueDate, setGenerateDueDate] = useState("");
  // YEARLY-only: which calendar year this generation run is for. Passed as
  // `year` in the request body so the backend's own idempotency check
  // (student+structure+month+year) correctly treats next year's generation
  // as a fresh run instead of silently skipping forever after the first
  // year (the exact bug this whole fix exists to close -- confirmed live,
  // a real YEARLY fee had zero invoices ever generated for anyone since
  // this button never offered YEARLY at all before now).
  const [generateYear, setGenerateYear] = useState(String(new Date().getFullYear()));
  function openGenerateDialog(s: FeeStructure) {
    if (s.target_due_date) {
      setGenerateDueDate(s.target_due_date.slice(0, 10));
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setGenerateDueDate(d.toISOString().slice(0, 10));
    }
    setGenerateYear(String(new Date().getFullYear()));
    setGenerateTarget(s);
  }
  const generateClassIds = generateTarget
    ? generateTarget.classes.length
      ? generateTarget.classes.map((c) => c.class.id)
      : generateTarget.class_id
        ? [generateTarget.class_id]
        : null
    : null;

  // Raw eligible-student count, not net of already-invoiced -- an honest
  // upper bound shown before committing (per this codebase's "never a
  // blind bulk write" convention for Bulk SMS / Bulk Create Student
  // Logins), not a promise of exactly-this-many new charges. The actual
  // generate call below reports the real created/skipped breakdown after.
  const { data: generatePreviewTotal } = useQuery<number>({
    queryKey: ["students", "count-for-generate", generateTarget?.id, generateClassIds?.join(",")],
    queryFn: async () => {
      const params: Record<string, string> = { status: "ACTIVE", limit: "1" };
      if (generateClassIds) params.class_ids = generateClassIds.join(",");
      return (await api.get("/api/students", { params })).data.meta.total as number;
    },
    enabled: !!generateTarget,
  });

  const generateInvoicesMutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/invoices/generate", {
        fee_structure_id: generateTarget!.id,
        due_date: generateDueDate,
        ...(generateTarget?.frequency === "YEARLY" ? { year: Number(generateYear) } : {}),
      }),
    onSuccess: (res) => {
      const { created, skipped_duplicates } = res.data.data as { created: number; skipped_duplicates: number };
      toast.success(`Generated ${created} invoice${created === 1 ? "" : "s"}${skipped_duplicates ? ` (${skipped_duplicates} already existed)` : ""}`);
      setGenerateTarget(null);
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to generate invoices"),
  });

  // Assign to Classes / Groups dialog -- each selectable option is either a
  // whole class (synthetic id = the class id) or one specific Group within
  // a class (synthetic id = "classId::groupId"), so the existing generic
  // MultiSelectChecklist can be reused as-is instead of building a new
  // nested tree component. Picking one clears the other for the same
  // class (whole-class and a group within it are mutually exclusive --
  // picking a group after "whole class" was already checked replaces it,
  // and vice versa), since having both checked would be redundant.
  const [classesTarget, setClassesTarget] = useState<FeeStructure | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [overlapMessage, setOverlapMessage] = useState<string | null>(null);

  const openAssignClasses = (s: FeeStructure) => {
    setClassesTarget(s);
    setSelectedEntryIds(s.classes.map((c) => (c.group ? `${c.class.id}::${c.group.id}` : c.class.id)));
  };

  const classGroupOptions = (classes ?? []).flatMap((c) => [
    { id: c.id, label: c.groups.length ? `${c.name_en} — whole class` : c.name_en },
    ...c.groups.map((g) => ({ id: `${c.id}::${g.id}`, label: `${c.name_en} — ${g.name_en}` })),
  ]);

  function handleEntryChange(newIds: string[]) {
    const added = newIds.find((id) => !selectedEntryIds.includes(id));
    if (added) {
      const classId = added.split("::")[0];
      newIds = added.includes("::")
        ? newIds.filter((id) => id === added || id !== classId) // adding a group -- drop the whole-class entry for this class
        : newIds.filter((id) => id === added || !id.startsWith(`${classId}::`)); // adding whole-class -- drop this class's group entries
    }
    setSelectedEntryIds(newIds);
  }

  const assignClassesMutation = useMutation({
    mutationFn: (override?: boolean) =>
      api.put(`/api/fees/structures/${classesTarget!.id}/classes`, {
        entries: selectedEntryIds.map((id) => {
          const [class_id, group_id] = id.split("::");
          return { class_id, group_id: group_id ?? null };
        }),
        override_overlap: override,
      }),
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

  // Assign to Students dialog -- server-side search-as-you-type (the
  // student universe is too large to list all at once, unlike the class
  // checklist above), add/remove into a working list, full-replace on Save.
  const [studentsTarget, setStudentsTarget] = useState<FeeStructure | null>(null);
  const [assignedStudents, setAssignedStudents] = useState<StudentOption[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  // Same cascading Class -> Section -> Group narrowing used everywhere else
  // a student needs to be found (Add Student wizard, Collect Fee) -- typing
  // a name/ID alone doesn't scale once there's more than a handful of
  // matches, and gives no way to just browse "everyone in Class 9 Science."
  const [studentFilterClassId, setStudentFilterClassId] = useState("");
  const [studentFilterSectionId, setStudentFilterSectionId] = useState("");
  const [studentFilterGroupId, setStudentFilterGroupId] = useState("");
  const studentFilterClass = classes?.find((c) => c.id === studentFilterClassId);

  const openAssignStudents = (s: FeeStructure) => {
    setStudentsTarget(s);
    setAssignedStudents(s.students.map((row) => row.student));
    setStudentSearch("");
    setStudentFilterClassId("");
    setStudentFilterSectionId("");
    setStudentFilterGroupId("");
  };

  const { data: studentSearchResults } = useQuery<StudentOption[]>({
    queryKey: ["students", "search-for-fee-assign", studentSearch, studentFilterClassId, studentFilterSectionId, studentFilterGroupId],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: {
            search: studentSearch || undefined,
            class_id: studentFilterClassId || undefined,
            section_id: studentFilterSectionId || undefined,
            group_id: studentFilterGroupId || undefined,
            limit: 20,
          },
        })
      ).data.data,
    // Fires once EITHER a real search term is typed OR a Class filter is
    // picked (browse mode) -- narrowing by class alone, with no name typed,
    // is a legitimate way to find someone too.
    enabled: !!studentsTarget && (studentSearch.trim().length >= 2 || !!studentFilterClassId),
  });

  const assignStudentsMutation = useMutation({
    mutationFn: () => api.put(`/api/fees/structures/${studentsTarget!.id}/students`, { student_ids: assignedStudents.map((s) => s.id) }),
    onSuccess: () => {
      toast.success("Students assigned");
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
      setStudentsTarget(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to assign students"),
  });

  // Bulk assignment -- pick several fee structures at once (Tuition +
  // Library + Development, say) and assign the same classes/groups or
  // students to all of them in one action, instead of repeating "Assign to
  // Classes/Groups" once per structure. Deliberately ADDITIVE per
  // structure (merges into whatever it's already assigned to, never
  // replaces) -- a naive per-structure full-replace loop using the exact
  // same target list for every selected structure would silently wipe out
  // any of THEIR OWN pre-existing, individually-different assignments the
  // moment they're included in a bulk action alongside others.
  const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);
  const selectedStructures = (structures ?? []).filter((s) => selectedStructureIds.includes(s.id));
  const toggleStructureSelected = (id: string) =>
    setSelectedStructureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const [bulkClassesOpen, setBulkClassesOpen] = useState(false);
  const [bulkEntryIds, setBulkEntryIds] = useState<string[]>([]);
  const bulkAssignClassesMutation = useMutation({
    mutationFn: async () => {
      const newEntries: { class_id: string; group_id: string | null }[] = bulkEntryIds.map((id) => {
        const [class_id, group_id] = id.split("::");
        return { class_id: class_id!, group_id: group_id || null };
      });
      const failed: { name: string; reason: string }[] = [];
      for (const structure of selectedStructures) {
        try {
          const existing = structure.classes.map((c) => ({ class_id: c.class.id, group_id: c.group?.id ?? null }));
          const merged = [...existing];
          for (const ne of newEntries) {
            if (!merged.some((e) => e.class_id === ne.class_id && e.group_id === ne.group_id)) merged.push(ne);
          }
          // override_overlap is unconditional here (no interactive confirm,
          // unlike the single-structure flow) -- a bulk action across N
          // structures can't cleanly show one shared overlap-confirmation
          // dialog, and this is already a deliberate, explicit admin action
          // (picking multiple structures on purpose), not an accidental one.
          await api.put(`/api/fees/structures/${structure.id}/classes`, { entries: merged, override_overlap: true });
        } catch (err) {
          failed.push({ name: structure.name, reason: extractErrorMessage(err) ?? "Unknown error" });
        }
      }
      return { total: selectedStructures.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      if (failed.length) toast.error(`${total - failed.length} of ${total} succeeded. Failed: ${failed.map((f) => f.name).join(", ")}`);
      else toast.success(`Classes/Groups added to ${total} fee structure(s)`);
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
      setBulkClassesOpen(false);
      setBulkEntryIds([]);
      setSelectedStructureIds([]);
    },
  });

  const [bulkStudentsOpen, setBulkStudentsOpen] = useState(false);
  const [bulkStudents, setBulkStudents] = useState<StudentOption[]>([]);
  const [bulkStudentSearch, setBulkStudentSearch] = useState("");
  const [bulkFilterClassId, setBulkFilterClassId] = useState("");
  const [bulkFilterSectionId, setBulkFilterSectionId] = useState("");
  const [bulkFilterGroupId, setBulkFilterGroupId] = useState("");
  const bulkFilterClass = classes?.find((c) => c.id === bulkFilterClassId);
  const { data: bulkStudentResults } = useQuery<StudentOption[]>({
    queryKey: ["students", "search-for-bulk-fee-assign", bulkStudentSearch, bulkFilterClassId, bulkFilterSectionId, bulkFilterGroupId],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: { search: bulkStudentSearch || undefined, class_id: bulkFilterClassId || undefined, section_id: bulkFilterSectionId || undefined, group_id: bulkFilterGroupId || undefined, limit: 20 },
        })
      ).data.data,
    enabled: bulkStudentsOpen && (bulkStudentSearch.trim().length >= 2 || !!bulkFilterClassId),
  });
  const bulkAssignStudentsMutation = useMutation({
    mutationFn: async () => {
      const newIds = bulkStudents.map((s) => s.id);
      const failed: { name: string; reason: string }[] = [];
      for (const structure of selectedStructures) {
        try {
          const existingIds = structure.students.map((row) => row.student.id);
          const merged = [...new Set([...existingIds, ...newIds])];
          await api.put(`/api/fees/structures/${structure.id}/students`, { student_ids: merged });
        } catch (err) {
          failed.push({ name: structure.name, reason: extractErrorMessage(err) ?? "Unknown error" });
        }
      }
      return { total: selectedStructures.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      if (failed.length) toast.error(`${total - failed.length} of ${total} succeeded. Failed: ${failed.map((f) => f.name).join(", ")}`);
      else toast.success(`Students added to ${total} fee structure(s)`);
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
      setBulkStudentsOpen(false);
      setBulkStudents([]);
      setSelectedStructureIds([]);
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Fee Structures" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Structures" }]} action={<Button onClick={openCreate}>+ Add Fee Structure</Button>} />

      {structuresLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : structuresError ? (
        <ErrorState title="Failed to load fee structures" description={extractErrorMessage(structuresErrorObj)} retryLabel="Retry" onRetry={() => refetchStructures()} />
      ) : (
      <>
      {!structures?.length && <EmptyState title="No fee structures yet" />}

      {selectedStructureIds.length > 0 && (
        <Card className="border-primary">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <p className="text-sm font-medium">{selectedStructureIds.length} fee structure{selectedStructureIds.length === 1 ? "" : "s"} selected</p>
            <Button size="sm" onClick={() => { setBulkEntryIds([]); setBulkClassesOpen(true); }}>Bulk Assign to Classes/Groups</Button>
            <Button size="sm" onClick={() => { setBulkStudents([]); setBulkStudentSearch(""); setBulkFilterClassId(""); setBulkFilterSectionId(""); setBulkFilterGroupId(""); setBulkStudentsOpen(true); }}>Bulk Assign to Students</Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedStructureIds([])}>Clear selection</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2 w-8">
                  <Checkbox
                    checked={!!structures?.length && selectedStructureIds.length === structures.length}
                    onCheckedChange={() => setSelectedStructureIds((prev) => (prev.length === structures?.length ? [] : (structures ?? []).map((s) => s.id)))}
                  />
                </th>
                <th className="p-2">Name</th><th className="p-2">Category</th><th className="p-2">Sub-Category</th><th className="p-2">Amount</th>
                <th className="p-2">Frequency</th><th className="p-2">Applies To</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {structures?.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="p-2"><Checkbox checked={selectedStructureIds.includes(s.id)} onCheckedChange={() => toggleStructureSelected(s.id)} /></td>
                  <td className="p-2">{s.name}</td>
                  <td className="p-2"><Badge variant="outline">{s.category}</Badge></td>
                  <td className="p-2 text-muted-foreground">{s.fee_sub_category?.name ?? "—"}</td>
                  <td className="p-2">৳{s.amount}</td>
                  <td className="p-2">{s.frequency}</td>
                  <td className="p-2 text-muted-foreground">{describeScope(s)}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      {(s.frequency === "ONE_TIME" || s.frequency === "YEARLY") && (
                        <Button size="sm" variant="outline" onClick={() => openGenerateDialog(s)}>Generate Invoices</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openAssignClasses(s)}>Assign to Classes/Groups</Button>
                      <Button size="sm" variant="outline" onClick={() => openAssignStudents(s)}>Assign to Students</Button>
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
      </>
      )}

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
              {CATEGORY_HELP[form.category] && <p className="text-xs text-muted-foreground">{CATEGORY_HELP[form.category]}</p>}
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
            {form.frequency === "ONE_TIME" ? (
              <div className="space-y-1.5">
                <Label>Target Due Date</Label>
                <Input type="date" value={form.target_due_date} onChange={(e) => setForm({ ...form, target_due_date: e.target.value })} />
                <p className="text-xs text-muted-foreground">Shown to families as the upcoming deadline before this fee is even generated, and used as the default due date when generating it.</p>
              </div>
            ) : (
              <div className="space-y-1.5"><Label>Due Day of Month</Label><Input type="number" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: Number(e.target.value) })} /></div>
            )}
            <p className="text-xs text-muted-foreground">Use &quot;Assign to Classes/Groups&quot; or &quot;Assign to Students&quot; from the list to scope this structure.</p>
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
          <DialogHeader><DialogTitle>Assign Classes / Groups — {classesTarget?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pick whole classes, or expand to specific Groups within a class so two groups (e.g. Science vs Commerce) can carry different fees. Picking a class and one of its groups at the same time isn&apos;t allowed — the more specific pick replaces the other. Section-level narrowing isn&apos;t supported for a multi-class assignment.
          </p>
          <MultiSelectChecklist
            options={classGroupOptions}
            selected={selectedEntryIds}
            onChange={handleEntryChange}
          />
          <DialogFooter>
            <Button disabled={!selectedEntryIds.length || assignClassesMutation.isPending} onClick={() => assignClassesMutation.mutate(undefined)}>
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

      <Dialog open={!!studentsTarget} onOpenChange={(v) => !v && setStudentsTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Assign to Specific Students — {studentsTarget?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Attaches this fee directly to the students below, on top of (not instead of) whatever classes/groups it&apos;s also assigned to — useful for a student taking an extra elective, or a one-off charge for just this one person.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={studentFilterClassId}
              onChange={(e) => { setStudentFilterClassId(e.target.value); setStudentFilterSectionId(""); setStudentFilterGroupId(""); }}
            >
              <option value="">All classes</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={studentFilterSectionId}
              onChange={(e) => setStudentFilterSectionId(e.target.value)}
              disabled={!studentFilterClassId}
            >
              <option value="">All sections</option>
              {studentFilterClass?.sections?.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
            </select>
            {!!studentFilterClass?.groups?.length && (
              <select className="rounded-md border px-2 py-1.5 text-sm" value={studentFilterGroupId} onChange={(e) => setStudentFilterGroupId(e.target.value)}>
                <option value="">All groups</option>
                {studentFilterClass.groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
              </select>
            )}
            <Input className="max-w-[200px]" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name or ID..." />
          </div>
          {(studentSearch.trim().length >= 2 || !!studentFilterClassId) && (
            <div className="space-y-1">
              {(studentSearchResults?.length ?? 0) > 1 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setAssignedStudents((prev) => {
                    const existingIds = new Set(prev.map((s) => s.id));
                    const toAdd = (studentSearchResults ?? []).filter((s) => !existingIds.has(s.id));
                    return [...prev, ...toAdd];
                  })}
                >
                  + Add all {studentSearchResults?.length} shown
                </button>
              )}
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {studentSearchResults?.length ? studentSearchResults.map((st) => (
                  <div key={st.id} className="flex items-center justify-between text-sm">
                    <span>{st.name_en} <span className="font-mono text-xs text-muted-foreground">{st.student_uid}</span></span>
                    <Button
                      size="sm" variant="outline"
                      disabled={assignedStudents.some((a) => a.id === st.id)}
                      onClick={() => setAssignedStudents((prev) => (prev.some((a) => a.id === st.id) ? prev : [...prev, st]))}
                    >
                      {assignedStudents.some((a) => a.id === st.id) ? "Added" : "+ Add"}
                    </Button>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No matches.</p>}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Assigned students ({assignedStudents.length})</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {assignedStudents.length ? assignedStudents.map((st) => (
                <div key={st.id} className="flex items-center justify-between text-sm">
                  <span>{st.name_en} <span className="font-mono text-xs text-muted-foreground">{st.student_uid}</span></span>
                  <Button size="sm" variant="outline" onClick={() => setAssignedStudents((prev) => prev.filter((a) => a.id !== st.id))}>Remove</Button>
                </div>
              )) : <p className="text-sm text-muted-foreground">No students individually assigned.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button disabled={assignStudentsMutation.isPending} onClick={() => assignStudentsMutation.mutate()}>
              {assignStudentsMutation.isPending ? "Saving..." : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!generateTarget} onOpenChange={(v) => !v && setGenerateTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Invoices — {generateTarget?.name}</DialogTitle></DialogHeader>
          {generateClassIds === null ? (
            <p className="text-sm text-amber-700">
              This fee has no classes assigned — generating will apply to <strong>all active students institution-wide</strong>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Applies to: {generateTarget ? describeScope(generateTarget) : ""}
            </p>
          )}
          {generateTarget?.frequency === "YEARLY" && (
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" value={generateYear} onChange={(e) => setGenerateYear(e.target.value)} placeholder={String(new Date().getFullYear())} />
              <p className="text-xs text-muted-foreground">
                Which year this charge is for — generating again for the same year skips students who already have it; a new year always generates fresh.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={generateDueDate} onChange={(e) => setGenerateDueDate(e.target.value)} />
          </div>
          <p className="text-sm">
            {generatePreviewTotal === undefined ? (
              "Calculating..."
            ) : (
              <>
                Eligible: <strong>{generatePreviewTotal}</strong> active student{generatePreviewTotal === 1 ? "" : "s"} · Up to{" "}
                <strong>৳{(generatePreviewTotal * (generateTarget?.amount ?? 0)).toLocaleString()}</strong>
                <br />
                <span className="text-xs text-muted-foreground">
                  Students who already have this invoice are skipped automatically — this is an upper bound, not a guarantee of new charges.
                </span>
              </>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateTarget(null)}>Cancel</Button>
            <Button
              onClick={() => generateInvoicesMutation.mutate()}
              disabled={
                generateInvoicesMutation.isPending ||
                generatePreviewTotal === undefined ||
                !generateDueDate ||
                (generateTarget?.frequency === "YEARLY" && !generateYear)
              }
            >
              {generateInvoicesMutation.isPending ? "Generating..." : "Generate Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkClassesOpen} onOpenChange={setBulkClassesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Assign to Classes/Groups — {selectedStructureIds.length} fee structure{selectedStructureIds.length === 1 ? "" : "s"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Applies to: {selectedStructures.map((s) => s.name).join(", ")}
          </p>
          <p className="text-sm text-muted-foreground">
            Adds the classes/groups picked below to each selected structure, on top of whatever it&apos;s already assigned to — nothing existing is removed.
          </p>
          <MultiSelectChecklist options={classGroupOptions} selected={bulkEntryIds} onChange={setBulkEntryIds} />
          <DialogFooter>
            <Button disabled={!bulkEntryIds.length || bulkAssignClassesMutation.isPending} onClick={() => bulkAssignClassesMutation.mutate()}>
              {bulkAssignClassesMutation.isPending ? "Saving..." : `Add to ${selectedStructureIds.length} Structure${selectedStructureIds.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkStudentsOpen} onOpenChange={setBulkStudentsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Bulk Assign to Students — {selectedStructureIds.length} fee structure{selectedStructureIds.length === 1 ? "" : "s"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Applies to: {selectedStructures.map((s) => s.name).join(", ")}
          </p>
          <p className="text-sm text-muted-foreground">
            Adds the students picked below to each selected structure&apos;s individual assignment, on top of any classes/groups or other students already assigned.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={bulkFilterClassId}
              onChange={(e) => { setBulkFilterClassId(e.target.value); setBulkFilterSectionId(""); setBulkFilterGroupId(""); }}
            >
              <option value="">All classes</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={bulkFilterSectionId} onChange={(e) => setBulkFilterSectionId(e.target.value)} disabled={!bulkFilterClassId}>
              <option value="">All sections</option>
              {bulkFilterClass?.sections?.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
            </select>
            {!!bulkFilterClass?.groups?.length && (
              <select className="rounded-md border px-2 py-1.5 text-sm" value={bulkFilterGroupId} onChange={(e) => setBulkFilterGroupId(e.target.value)}>
                <option value="">All groups</option>
                {bulkFilterClass.groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
              </select>
            )}
            <Input className="max-w-[200px]" value={bulkStudentSearch} onChange={(e) => setBulkStudentSearch(e.target.value)} placeholder="Search by name or ID..." />
          </div>
          {(bulkStudentSearch.trim().length >= 2 || !!bulkFilterClassId) && (
            <div className="space-y-1">
              {(bulkStudentResults?.length ?? 0) > 1 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setBulkStudents((prev) => {
                    const existingIds = new Set(prev.map((s) => s.id));
                    return [...prev, ...(bulkStudentResults ?? []).filter((s) => !existingIds.has(s.id))];
                  })}
                >
                  + Add all {bulkStudentResults?.length} shown
                </button>
              )}
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {bulkStudentResults?.length ? bulkStudentResults.map((st) => (
                  <div key={st.id} className="flex items-center justify-between text-sm">
                    <span>{st.name_en} <span className="font-mono text-xs text-muted-foreground">{st.student_uid}</span></span>
                    <Button
                      size="sm" variant="outline"
                      disabled={bulkStudents.some((a) => a.id === st.id)}
                      onClick={() => setBulkStudents((prev) => (prev.some((a) => a.id === st.id) ? prev : [...prev, st]))}
                    >
                      {bulkStudents.some((a) => a.id === st.id) ? "Added" : "+ Add"}
                    </Button>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No matches.</p>}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Students to add ({bulkStudents.length})</Label>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {bulkStudents.length ? bulkStudents.map((st) => (
                <div key={st.id} className="flex items-center justify-between text-sm">
                  <span>{st.name_en} <span className="font-mono text-xs text-muted-foreground">{st.student_uid}</span></span>
                  <Button size="sm" variant="outline" onClick={() => setBulkStudents((prev) => prev.filter((a) => a.id !== st.id))}>Remove</Button>
                </div>
              )) : <p className="text-sm text-muted-foreground">None picked yet.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!bulkStudents.length || bulkAssignStudentsMutation.isPending} onClick={() => bulkAssignStudentsMutation.mutate()}>
              {bulkAssignStudentsMutation.isPending ? "Saving..." : `Add to ${selectedStructureIds.length} Structure${selectedStructureIds.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
