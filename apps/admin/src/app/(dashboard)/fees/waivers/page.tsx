"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage,
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
  student: {
    id: string; name_en: string; student_uid: string;
    current_class: { name_en: string } | null;
    current_section: { name: string } | null;
    group: { name_en: string } | null;
    father_phone: string | null;
  };
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
  groups?: { id: string; name_en: string }[];
}
interface WaiverRequestRow {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  created_at: string;
  student: {
    id: string; name_en: string; student_uid: string;
    current_class: { name_en: string } | null;
    current_section: { name: string } | null;
  };
  student_waiver: { waiver_type: WaiverType } | null;
  context: { outstanding_due: number; active_waiver_count: number };
}

const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

export default function WaiverSetupPage() {
  const queryClient = useQueryClient();

  const { data: types, isLoading: typesLoading, isError: typesError, error: typesErrorObj, refetch: refetchTypes } = useQuery<WaiverType[]>({ queryKey: ["fees", "waiver-types"], queryFn: async () => (await api.get("/api/fees/waiver-types")).data.data });
  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, error: assignmentsErrorObj, refetch: refetchAssignments } = useQuery<StudentWaiverRow[]>({ queryKey: ["fees", "student-waivers"], queryFn: async () => (await api.get("/api/fees/student-waivers")).data.data });
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });

  // Waiver Requests queue -- student/guardian-submitted requests for
  // financial assistance. Status filter defaults to Pending (the actual
  // queue); Approved/Rejected/All are for reviewing past decisions.
  const [requestStatusFilter, setRequestStatusFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "">("PENDING");
  const { data: requests, isLoading: requestsLoading, isError: requestsError, error: requestsErrorObj, refetch: refetchRequests } = useQuery<WaiverRequestRow[]>({
    queryKey: ["fees", "waiver-requests", requestStatusFilter],
    queryFn: async () => (await api.get("/api/fees/waiver-requests", { params: { status: requestStatusFilter || undefined } })).data.data,
  });

  const [approveTarget, setApproveTarget] = useState<WaiverRequestRow | null>(null);
  const [approveTypeId, setApproveTypeId] = useState("");
  const [rejectTarget, setRejectTarget] = useState<WaiverRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const approveRequestMutation = useMutation({
    mutationFn: () => api.put(`/api/fees/waiver-requests/${approveTarget!.id}/approve`, { waiver_type_id: approveTypeId }),
    onSuccess: (res) => {
      const { invoices_affected, total_discount } = res.data.data as { invoices_affected: number; total_discount: number };
      const retroNote = invoices_affected > 0 ? ` — applied to ${invoices_affected} existing invoice${invoices_affected === 1 ? "" : "s"} (৳${total_discount} discounted)` : "";
      toast.success(`Waiver request approved${retroNote}`);
      queryClient.invalidateQueries({ queryKey: ["fees", "waiver-requests"] });
      queryClient.invalidateQueries({ queryKey: ["fees", "student-waivers"] });
      setApproveTarget(null);
      setApproveTypeId("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to approve request"),
  });

  const rejectRequestMutation = useMutation({
    mutationFn: () => api.put(`/api/fees/waiver-requests/${rejectTarget!.id}/reject`, { rejection_reason: rejectReason }),
    onSuccess: () => {
      toast.success("Waiver request rejected");
      queryClient.invalidateQueries({ queryKey: ["fees", "waiver-requests"] });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to reject request"),
  });

  // Waiver Type create/edit dialog -- one shared form, same pattern as
  // Fee Structures' own create/edit dialog (editingTypeId set = edit mode).
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [applicableCategories, setApplicableCategories] = useState<string[]>([]);

  function resetTypeDialog() {
    setEditingTypeId(null);
    setTypeName(""); setTypeDescription(""); setDiscountValue(""); setApplicableCategories([]); setDiscountType("PERCENTAGE");
  }
  function openCreateType() {
    resetTypeDialog();
    setTypeOpen(true);
  }
  function openEditType(t: WaiverType) {
    setEditingTypeId(t.id);
    setTypeName(t.name);
    setTypeDescription(t.description ?? "");
    setDiscountType(t.discount_type);
    setDiscountValue(String(t.discount_value));
    setApplicableCategories(t.applicable_categories);
    setTypeOpen(true);
  }

  const saveTypeMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: typeName,
        description: typeDescription || undefined,
        discount_type: discountType,
        discount_value: Number(discountValue),
        applicable_categories: applicableCategories,
      };
      return editingTypeId ? api.put(`/api/fees/waiver-types/${editingTypeId}`, body) : api.post("/api/fees/waiver-types", body);
    },
    onSuccess: () => {
      toast.success(editingTypeId ? "Waiver type updated" : "Waiver type created");
      queryClient.invalidateQueries({ queryKey: ["fees", "waiver-types"] });
      setTypeOpen(false);
      resetTypeDialog();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save waiver type"),
  });

  // Assign Waiver dialog -- roster picker (Class/Section filter, real
  // name/class/section/roll detail per row), multi-select so one or many
  // students can be assigned the same waiver in a single action.
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSectionId, setAssignSectionId] = useState("");
  const [assignGroupId, setAssignGroupId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedStudentLabels, setSelectedStudentLabels] = useState<Record<string, string>>({});
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const assignClassSections = classes?.find((c) => c.id === assignClassId)?.sections ?? [];
  const assignClassGroups = classes?.find((c) => c.id === assignClassId)?.groups ?? [];

  function resetAssignDialog() {
    setAssignClassId("");
    setAssignSectionId("");
    setAssignGroupId("");
    setSelectedStudentIds([]);
    setSelectedStudentLabels({});
    setSelectedTypeId("");
  }

  const bulkAssignMutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/student-waivers/bulk", { student_ids: selectedStudentIds, waiver_type_id: selectedTypeId }),
    onSuccess: (res) => {
      const { created, skipped, invoices_affected, total_discount } = res.data.data as {
        created: number; skipped: string[]; invoices_affected: number; total_discount: number;
      };
      const retroNote = invoices_affected > 0 ? ` — applied to ${invoices_affected} existing invoice${invoices_affected === 1 ? "" : "s"} (৳${total_discount} discounted)` : "";
      toast.success(`Waiver assigned to ${created} student(s)${skipped.length ? ` — ${skipped.length} skipped` : ""}${retroNote}`);
      queryClient.invalidateQueries({ queryKey: ["fees", "student-waivers"] });
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] });
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

  // Blocks each dialog's default close-on-outside-click/Escape once the
  // admin has actually started filling it in, so in-progress input (or a
  // partially-built student selection) is never silently lost — requires
  // the explicit Cancel/X action instead (Plan Fifteen, Phase E).
  const typeDirty = typeName !== "" || typeDescription !== "" || discountValue !== "" || applicableCategories.length > 0;
  const assignDirty = selectedStudentIds.length > 0 || selectedTypeId !== "";

  return (
    <PageWrapper>
      <PageHeader
        title="Waiver Setup"
        subtitle="Reusable waiver templates and student assignments"
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Waivers" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateType}>+ New Waiver Type</Button>
            <Button onClick={() => setAssignOpen(true)} disabled={!types?.length}>+ Assign Waiver</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-sm font-medium">Waiver Types</p>
          {typesLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : typesError ? (
            <ErrorState title="Failed to load waiver types" description={extractErrorMessage(typesErrorObj)} retryLabel="Retry" onRetry={() => refetchTypes()} />
          ) : (
            <>
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
                    <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => openEditType(t)}>Edit</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Waiver Requests</p>
            <Select value={requestStatusFilter || "ALL"} onValueChange={(v) => setRequestStatusFilter(v === "ALL" ? "" : (v as "PENDING" | "APPROVED" | "REJECTED"))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {requestsLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : requestsError ? (
            <ErrorState title="Failed to load waiver requests" description={extractErrorMessage(requestsErrorObj)} retryLabel="Retry" onRetry={() => refetchRequests()} />
          ) : (
            <>
              {!requests?.length && <EmptyState title="No requests" description="No student waiver requests match this filter." />}
              <div className="space-y-3">
                {requests?.map((r) => (
                  <Card key={r.id} className="border">
                    <CardContent className="space-y-2 pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">
                            {r.student.name_en} <span className="font-mono text-xs text-muted-foreground">{r.student.student_uid}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {r.student.current_class?.name_en} {r.student.current_section && `· ${r.student.current_section.name}`}
                          </p>
                        </div>
                        <Badge variant={r.status === "APPROVED" ? "default" : r.status === "REJECTED" ? "destructive" : "outline"}>{r.status}</Badge>
                      </div>
                      <p className="text-sm">{r.reason}</p>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <Badge variant={r.context.outstanding_due > 0 ? "destructive" : "default"}>
                          {r.context.outstanding_due > 0 ? `৳${r.context.outstanding_due.toFixed(2)} due` : "No dues"}
                        </Badge>
                        {r.context.active_waiver_count > 0 && (
                          <Badge variant="outline">{r.context.active_waiver_count} existing waiver{r.context.active_waiver_count === 1 ? "" : "s"}</Badge>
                        )}
                      </div>
                      {r.status === "APPROVED" && r.student_waiver && (
                        <p className="text-sm font-medium text-emerald-600">
                          Granted: {r.student_waiver.waiver_type.name} (
                          {r.student_waiver.waiver_type.discount_type === "PERCENTAGE" ? `${r.student_waiver.waiver_type.discount_value}%` : `৳${r.student_waiver.waiver_type.discount_value}`}
                          )
                        </p>
                      )}
                      {r.status === "REJECTED" && r.rejection_reason && (
                        <p className="text-sm text-destructive">Reason: {r.rejection_reason}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleDateString()}</p>
                      {r.status === "PENDING" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" disabled={!types?.length} onClick={() => { setApproveTarget(r); setApproveTypeId(""); }}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => setRejectTarget(r)}>Reject</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-sm font-medium">Existing Waivers</p>
          {assignmentsLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : assignmentsError ? (
            <ErrorState title="Failed to load waivers" description={extractErrorMessage(assignmentsErrorObj)} retryLabel="Retry" onRetry={() => refetchAssignments()} />
          ) : (
            <>
          {!assignments?.length && <EmptyState title="No waivers assigned yet" />}
          {!!assignments?.length && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class / Section</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Phone</TableHead>
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
                    <TableCell>{a.student.current_class?.name_en ?? "—"}{a.student.current_section ? ` · ${a.student.current_section.name}` : ""}</TableCell>
                    <TableCell className="text-muted-foreground">{a.student.group?.name_en ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.student.father_phone ?? "—"}</TableCell>
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
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={typeOpen} onOpenChange={(v) => { setTypeOpen(v); if (!v) resetTypeDialog(); }}>
        <DialogContent
          onEscapeKeyDown={(e) => typeDirty && e.preventDefault()}
          onPointerDownOutside={(e) => typeDirty && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>{editingTypeId ? "Edit Waiver Type" : "New Waiver Type"}</DialogTitle></DialogHeader>
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
            <Button disabled={!typeName || !discountValue || saveTypeMutation.isPending} onClick={() => saveTypeMutation.mutate()}>
              {saveTypeMutation.isPending ? "Saving..." : editingTypeId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={(v) => { setAssignOpen(v); if (!v) resetAssignDialog(); }}>
        <DialogContent
          onEscapeKeyDown={(e) => assignDirty && e.preventDefault()}
          onPointerDownOutside={(e) => assignDirty && e.preventDefault()}
        >
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
                groupId={assignGroupId}
                setGroupId={setAssignGroupId}
                groups={assignClassGroups}
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

      {/* Approving a request grants the waiver -- picking a type here IS
          the accept action, never a bare status flip with no real waiver
          behind it. */}
      <Dialog open={!!approveTarget} onOpenChange={(v) => { if (!v) { setApproveTarget(null); setApproveTypeId(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => approveTypeId !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => approveTypeId !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Approve Waiver Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {approveTarget && (
              <p className="text-sm text-muted-foreground">
                {approveTarget.student.name_en} ({approveTarget.student.student_uid}) — &ldquo;{approveTarget.reason}&rdquo;
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Grant which Waiver Type?</Label>
              <Select value={approveTypeId} onValueChange={setApproveTypeId}>
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
          </div>
          <DialogFooter>
            <Button disabled={!approveTypeId || approveRequestMutation.isPending} onClick={() => approveRequestMutation.mutate()}>
              {approveRequestMutation.isPending ? "Approving..." : "Approve & Grant Waiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent
          onEscapeKeyDown={(e) => rejectReason !== "" && e.preventDefault()}
          onPointerDownOutside={(e) => rejectReason !== "" && e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Reject Waiver Request</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (shown to the student/guardian)</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Outstanding fee dues from a prior term" />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => rejectRequestMutation.mutate()} disabled={rejectRequestMutation.isPending || !rejectReason}>
              Reject Request
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
  classes, classId, setClassId, sectionId, setSectionId, sections, groupId, setGroupId, groups, selectedIds, onToggle,
}: {
  classes: ClassOption[];
  classId: string;
  setClassId: (v: string) => void;
  sectionId: string;
  setSectionId: (v: string) => void;
  sections: { id: string; name: string }[];
  groupId: string;
  setGroupId: (v: string) => void;
  groups: { id: string; name_en: string }[];
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
        filterKey={`${classId}:${sectionId}:${groupId}`}
        filters={
          <>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setGroupId(""); }}>
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
              <option value="">All Sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!!groups.length && (
              <select className="rounded-md border px-2 py-1.5 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">All Groups</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
              </select>
            )}
          </>
        }
        fetchResults={async ({ search, page }) =>
          (
            await api.get("/api/students", {
              params: { search: search || undefined, class_id: classId || undefined, section_id: sectionId || undefined, group_id: groupId || undefined, page, limit: 10 },
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
