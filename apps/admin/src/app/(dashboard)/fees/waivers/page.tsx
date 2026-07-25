"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  MultiRecordPickerDialog,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface WaiverType {
  id: string;
  name: string;
  description: string | null;
  discount_type: "PERCENTAGE" | "FIXED";
  discount_value: number;
  applicable_categories: string[];
  is_active: boolean;
}
interface StudentWaiverRow {
  id: string;
  student: { id: string; name_en: string; student_uid: string; current_class: { name_en: string } | null };
  waiver_type: WaiverType;
  academic_year: { id: string; label: string } | null;
  assigned_at: string;
  revoked_at: string | null;
}
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

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

export default function WaiverSetupPage() {
  const queryClient = useQueryClient();

  const { data: types } = useQuery<WaiverType[]>({ queryKey: ["fees", "waiver-types"], queryFn: async () => (await api.get("/api/fees/waiver-types")).data.data });
  const { data: assignments } = useQuery<StudentWaiverRow[]>({ queryKey: ["fees", "student-waivers"], queryFn: async () => (await api.get("/api/fees/student-waivers")).data.data });
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });

  // Waiver Type create dialog
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [applicableCategories, setApplicableCategories] = useState<string[]>([]);

  const createTypeMutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/waiver-types", {
        name: typeName,
        description: typeDescription || undefined,
        discount_type: discountType,
        discount_value: Number(discountValue),
        applicable_categories: applicableCategories,
      }),
    onSuccess: () => {
      toast.success("Waiver type created");
      queryClient.invalidateQueries({ queryKey: ["fees", "waiver-types"] });
      setTypeOpen(false);
      setTypeName(""); setTypeDescription(""); setDiscountValue(""); setApplicableCategories([]); setDiscountType("PERCENTAGE");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create waiver type"),
  });

  // Assign Waiver dialog -- roster picker (Class/Section filter, real
  // name/class/section/roll detail per row), multi-select so one or many
  // students can be assigned the same waiver in a single action.
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSectionId, setAssignSectionId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedStudentLabels, setSelectedStudentLabels] = useState<Record<string, string>>({});
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const assignClassSections = classes?.find((c) => c.id === assignClassId)?.sections ?? [];

  function resetAssignDialog() {
    setAssignClassId("");
    setAssignSectionId("");
    setSelectedStudentIds([]);
    setSelectedStudentLabels({});
    setSelectedTypeId("");
  }

  const bulkAssignMutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/student-waivers/bulk", { student_ids: selectedStudentIds, waiver_type_id: selectedTypeId }),
    onSuccess: (res) => {
      const { created, skipped } = res.data.data as { created: number; skipped: string[] };
      toast.success(`Waiver assigned to ${created} student(s)${skipped.length ? ` — ${skipped.length} skipped` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["fees", "student-waivers"] });
      setAssignOpen(false);
      resetAssignDialog();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to assign waiver"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/fees/student-waivers/${id}/revoke`),
    onSuccess: () => {
      toast.success("Waiver revoked");
      queryClient.invalidateQueries({ queryKey: ["fees", "student-waivers"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to revoke waiver"),
  });

  function toggleCategory(cat: string) {
    setApplicableCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Waiver Setup"
        subtitle="Reusable waiver templates and student assignments"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Waivers" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTypeOpen(true)}>+ New Waiver Type</Button>
            <Button onClick={() => setAssignOpen(true)} disabled={!types?.length}>+ Assign Waiver</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-sm font-medium">Waiver Types</p>
          {!types?.length && <EmptyState title="No waiver types yet" description="Create one to start assigning waivers to students." />}
          {!!types?.length && (
            <div className="flex flex-wrap gap-3">
              {types.map((t) => (
                <Card key={t.id} className="w-64 border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{t.name}</p>
                      {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="mt-1 text-lg font-bold text-primary">
                      {t.discount_type === "PERCENTAGE" ? `${t.discount_value}%` : `৳${t.discount_value}`}
                    </p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.applicable_categories.length ? t.applicable_categories.join(", ") : "All categories"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-sm font-medium">Existing Waivers</p>
          {!assignments?.length && <EmptyState title="No waivers assigned yet" />}
          {!!assignments?.length && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Waiver Type</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.student.name_en} <span className="font-mono text-xs text-muted-foreground">{a.student.student_uid}</span></TableCell>
                    <TableCell>{a.student.current_class?.name_en ?? "—"}</TableCell>
                    <TableCell>{a.waiver_type.name}</TableCell>
                    <TableCell>{a.waiver_type.discount_type === "PERCENTAGE" ? `${a.waiver_type.discount_value}%` : `৳${a.waiver_type.discount_value}`}</TableCell>
                    <TableCell>{a.academic_year?.label ?? "Every year"}</TableCell>
                    <TableCell>{new Date(a.assigned_at).toLocaleDateString()}</TableCell>
                    <TableCell>{a.revoked_at ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                    <TableCell>
                      {!a.revoked_at && (
                        <Button size="sm" variant="outline" onClick={() => revokeMutation.mutate(a.id)}>Revoke</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Waiver Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="e.g. Staff Child" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={typeDescription} onChange={(e) => setTypeDescription(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount Type</Label>
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as "PERCENTAGE" | "FIXED")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    <SelectItem value="FIXED">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{discountType === "PERCENTAGE" ? "Percentage (%)" : "Amount (৳)"}</Label>
                <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Applicable Categories (none selected = all)</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-full border px-3 py-1 text-xs ${applicableCategories.includes(cat) ? "border-primary bg-primary/10" : ""}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!typeName || !discountValue || createTypeMutation.isPending} onClick={() => createTypeMutation.mutate()}>
              {createTypeMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={(v) => { setAssignOpen(v); if (!v) resetAssignDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Waiver</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Waiver Type</Label>
              <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {types?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.discount_type === "PERCENTAGE" ? `${t.discount_value}%` : `৳${t.discount_value}`})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Students ({selectedStudentIds.length} selected)</Label>
              {!!selectedStudentIds.length && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedStudentIds.map((id) => (
                    <Badge key={id} variant="secondary">{selectedStudentLabels[id] ?? id}</Badge>
                  ))}
                </div>
              )}
              <MultiPickerLauncher
                classes={classes ?? []}
                classId={assignClassId}
                setClassId={setAssignClassId}
                sectionId={assignSectionId}
                setSectionId={setAssignSectionId}
                sections={assignClassSections}
                selectedIds={selectedStudentIds}
                onToggle={(s: RosterStudent) => {
                  setSelectedStudentIds((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
                  setSelectedStudentLabels((prev) => ({ ...prev, [s.id]: `${s.name_en} (${s.student_uid})` }));
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!selectedStudentIds.length || !selectedTypeId || bulkAssignMutation.isPending} onClick={() => bulkAssignMutation.mutate()}>
              {bulkAssignMutation.isPending ? "Assigning..." : `Assign to ${selectedStudentIds.length || ""} Student${selectedStudentIds.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}

// Small wrapper bundling the "Choose Students…" trigger + the roster
// picker dialog itself, since both need the Class/Section filter state
// that lives on the parent (the filter values are also what the picker's
// fetchResults call needs to read on every open).
function MultiPickerLauncher({
  classes, classId, setClassId, sectionId, setSectionId, sections, selectedIds, onToggle,
}: {
  classes: ClassOption[];
  classId: string;
  setClassId: (v: string) => void;
  sectionId: string;
  setSectionId: (v: string) => void;
  sections: { id: string; name: string }[];
  selectedIds: string[];
  onToggle: (s: RosterStudent) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>Choose Students…</Button>
      <MultiRecordPickerDialog<RosterStudent>
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose Students"
        searchPlaceholder="Search by name or student ID..."
        getKey={(s) => s.id}
        selected={selectedIds}
        onToggle={onToggle}
        filters={
          <>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
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
    </>
  );
}
