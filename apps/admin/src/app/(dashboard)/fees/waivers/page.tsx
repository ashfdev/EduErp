"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState, extractErrorMessage,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
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
interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
}

const CATEGORIES = ["ADMISSION", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

export default function WaiverSetupPage() {
  const queryClient = useQueryClient();

  const { data: types } = useQuery<WaiverType[]>({ queryKey: ["fees", "waiver-types"], queryFn: async () => (await api.get("/api/fees/waiver-types")).data.data });
  const { data: assignments } = useQuery<StudentWaiverRow[]>({ queryKey: ["fees", "student-waivers"], queryFn: async () => (await api.get("/api/fees/student-waivers")).data.data });

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

  // Assign Waiver dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState("");

  const { data: studentResults } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch, limit: 5 } })).data.data,
    enabled: studentSearch.length > 1 && !selectedStudent,
  });

  const assignMutation = useMutation({
    mutationFn: () => api.post("/api/fees/student-waivers", { student_id: selectedStudent!.id, waiver_type_id: selectedTypeId }),
    onSuccess: () => {
      toast.success("Waiver assigned");
      queryClient.invalidateQueries({ queryKey: ["fees", "student-waivers"] });
      setAssignOpen(false);
      setSelectedStudent(null); setStudentSearch(""); setSelectedTypeId("");
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

      <Dialog open={assignOpen} onOpenChange={(v) => { setAssignOpen(v); if (!v) { setSelectedStudent(null); setStudentSearch(""); setSelectedTypeId(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Waiver</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Student</Label>
              {selectedStudent ? (
                <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{selectedStudent.name_en} ({selectedStudent.student_uid})</span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search student..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                  {studentResults?.map((s) => (
                    <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                      {s.name_en} ({s.student_uid})
                    </button>
                  ))}
                </>
              )}
            </div>
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
          </div>
          <DialogFooter>
            <Button disabled={!selectedStudent || !selectedTypeId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
