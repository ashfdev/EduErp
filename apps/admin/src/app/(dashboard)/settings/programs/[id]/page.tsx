"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage, ErrorState, LoadingSpinner } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ProgramRow {
  id: string;
  name_en: string;
  code: string;
  duration_semesters: number;
  total_credit_hours: number;
  department: { name_en: string } | null;
}
interface PrereqRow {
  id: string;
  prerequisite_course: { id: string; code: string; name_en: string; semester_number: number };
}
interface CourseRow {
  id: string;
  program_id: string;
  semester_number: number;
  code: string;
  name_en: string;
  credit_hours: number;
  course_type: string;
  required_by: PrereqRow[];
}

function errMsg(err: unknown, fallback: string) {
  return extractErrorMessage(err) ?? fallback;
}

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: programs } = useQuery<ProgramRow[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
  });
  const program = programs?.find((p) => p.id === id);

  const { data: courses, isLoading, isError, error, refetch } = useQuery<CourseRow[]>({
    queryKey: ["settings", "courses", id],
    queryFn: async () => (await api.get("/api/settings/courses", { params: { program_id: id } })).data.data,
  });

  // Add/edit-course dialog
  const [courseOpen, setCourseOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [semesterNumber, setSemesterNumber] = useState(1);
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [creditHours, setCreditHours] = useState(3);
  const [courseType, setCourseType] = useState("THEORY");

  function openAddCourse() {
    setEditingCourseId(null);
    setSemesterNumber(1); setCode(""); setNameEn(""); setCreditHours(3); setCourseType("THEORY");
    setCourseOpen(true);
  }
  function openEditCourse(c: CourseRow) {
    setEditingCourseId(c.id);
    setSemesterNumber(c.semester_number);
    setCode(c.code);
    setNameEn(c.name_en);
    setCreditHours(c.credit_hours);
    setCourseType(c.course_type);
    setCourseOpen(true);
  }

  const saveCourseMutation = useMutation({
    mutationFn: () => {
      const payload = { semester_number: semesterNumber, code, name_en: nameEn, credit_hours: creditHours, course_type: courseType };
      return editingCourseId
        ? api.put(`/api/settings/courses/${editingCourseId}`, payload)
        : api.post("/api/settings/courses", { ...payload, program_id: id });
    },
    onSuccess: () => {
      toast.success(editingCourseId ? "Course updated" : "Course added");
      queryClient.invalidateQueries({ queryKey: ["settings", "courses", id] });
      setCourseOpen(false);
      setSemesterNumber(1); setCode(""); setNameEn(""); setCreditHours(3); setCourseType("THEORY");
    },
    onError: (err: unknown) => toast.error(errMsg(err, editingCourseId ? "Failed to update course" : "Failed to add course")),
  });

  // Bulk-add dialog — one dialog submission per course was too slow for
  // real university onboarding; this sends several rows as sequential
  // POSTs and reports per-row success/failure without discarding valid rows.
  const [bulkOpen, setBulkOpen] = useState(false);
  const emptyBulkRow = () => ({ semester_number: 1, code: "", name_en: "", credit_hours: 3, course_type: "THEORY" });
  const [bulkRows, setBulkRows] = useState([emptyBulkRow()]);
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: { row: number; reason: string }[] } | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  function updateBulkRow(index: number, patch: Partial<ReturnType<typeof emptyBulkRow>>) {
    setBulkRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addBulkRow() {
    setBulkRows((prev) => [...prev, emptyBulkRow()]);
  }
  function removeBulkRow(index: number) {
    setBulkRows((prev) => prev.filter((_, i) => i !== index));
  }
  async function submitBulkRows() {
    setBulkSubmitting(true);
    let created = 0;
    const failed: { row: number; reason: string }[] = [];
    for (const [index, row] of bulkRows.entries()) {
      try {
        await api.post("/api/settings/courses", { ...row, program_id: id });
        created++;
      } catch (err) {
        failed.push({ row: index + 1, reason: errMsg(err, "Failed") });
      }
    }
    setBulkSubmitting(false);
    setBulkResult({ created, failed });
    queryClient.invalidateQueries({ queryKey: ["settings", "courses", id] });
    if (!failed.length) {
      toast.success(`${created} course(s) added`);
      setBulkOpen(false);
      setBulkRows([emptyBulkRow()]);
      setBulkResult(null);
    }
  }

  const deleteCourseMutation = useMutation({
    mutationFn: (courseId: string) => api.delete(`/api/settings/courses/${courseId}`),
    onSuccess: () => {
      toast.success("Course deleted");
      queryClient.invalidateQueries({ queryKey: ["settings", "courses", id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err, "Failed to delete course")),
  });

  // Prerequisite dialog
  const [prereqCourseId, setPrereqCourseId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name_en: string } | null>(null);
  const [newPrereqId, setNewPrereqId] = useState("");
  const prereqCourse = courses?.find((c) => c.id === prereqCourseId);

  const addPrereqMutation = useMutation({
    mutationFn: () => api.post(`/api/settings/courses/${prereqCourseId}/prerequisites`, { prerequisite_course_id: newPrereqId }),
    onSuccess: () => {
      toast.success("Prerequisite added");
      queryClient.invalidateQueries({ queryKey: ["settings", "courses", id] });
      setNewPrereqId("");
    },
    onError: (err: unknown) => toast.error(errMsg(err, "Failed to add prerequisite")),
  });

  const removePrereqMutation = useMutation({
    mutationFn: (prereqId: string) => api.delete(`/api/settings/courses/${prereqCourseId}/prerequisites/${prereqId}`),
    onSuccess: () => {
      toast.success("Prerequisite removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "courses", id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err, "Failed to remove prerequisite")),
  });

  return (
    <PageWrapper>
      <PageHeader
        title={program?.name_en ?? "Program"}
        subtitle={program ? `${program.code} · ${program.department?.name_en ?? "No department"} · ${program.duration_semesters} semesters` : undefined}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Programs & Courses", href: "/settings/programs" }, { label: program?.name_en ?? "" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>+ Bulk Add Courses</Button>
            <Button onClick={openAddCourse}>+ Add Course</Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load courses" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!courses?.length && <EmptyState title="No courses yet" description="Add courses semester by semester, then wire up prerequisites between them." />}

      {!!courses?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sem</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Credit Hours</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Prerequisites</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.semester_number}</TableCell>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell>{c.name_en}</TableCell>
                    <TableCell>{c.credit_hours === 0 ? <Badge variant="outline">Audit</Badge> : c.credit_hours}</TableCell>
                    <TableCell><Badge variant="outline">{c.course_type}</Badge></TableCell>
                    <TableCell>
                      {c.required_by.length ? c.required_by.map((r) => r.prerequisite_course.code).join(", ") : <span className="text-muted-foreground">None</span>}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditCourse(c)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setPrereqCourseId(c.id)}>Prerequisites</Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget({ id: c.id, name_en: c.name_en })}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
        </>
      )}

      <Dialog open={courseOpen} onOpenChange={setCourseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCourseId ? "Edit Course" : "Add Course"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Semester Number</Label><Input type="number" min={1} value={semesterNumber} onChange={(e) => setSemesterNumber(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Credit Hours</Label><Input type="number" min={0} step={0.5} value={creditHours} onChange={(e) => setCreditHours(Number(e.target.value))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CSE-201" /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Data Structures" /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={courseType} onChange={(e) => setCourseType(e.target.value)}>
                <option value="THEORY">Theory</option>
                <option value="PRACTICAL">Practical</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveCourseMutation.mutate()} disabled={saveCourseMutation.isPending || !code || !nameEn}>
              {saveCourseMutation.isPending ? "Saving..." : editingCourseId ? "Save Changes" : "Add Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={(v) => { setBulkOpen(v); if (!v) { setBulkRows([emptyBulkRow()]); setBulkResult(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Bulk Add Courses</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {bulkRows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-2 rounded-md border p-2">
                <div className="col-span-1 space-y-1"><Label className="text-xs">Sem</Label><Input type="number" min={1} value={row.semester_number} onChange={(e) => updateBulkRow(index, { semester_number: Number(e.target.value) })} /></div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Code</Label><Input value={row.code} onChange={(e) => updateBulkRow(index, { code: e.target.value })} placeholder="CSE-201" /></div>
                <div className="col-span-4 space-y-1"><Label className="text-xs">Name</Label><Input value={row.name_en} onChange={(e) => updateBulkRow(index, { name_en: e.target.value })} placeholder="Data Structures" /></div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Credits</Label><Input type="number" min={0} step={0.5} value={row.credit_hours} onChange={(e) => updateBulkRow(index, { credit_hours: Number(e.target.value) })} /></div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Type</Label>
                  <select className="w-full rounded-md border px-2 py-2 text-sm" value={row.course_type} onChange={(e) => updateBulkRow(index, { course_type: e.target.value })}>
                    <option value="THEORY">Theory</option>
                    <option value="PRACTICAL">Practical</option>
                    <option value="BOTH">Both</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <Button size="sm" variant="outline" onClick={() => removeBulkRow(index)} disabled={bulkRows.length === 1}>✕</Button>
                </div>
              </div>
            ))}
            {!!bulkResult?.failed.length && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm text-destructive">
                <p className="font-medium">{bulkResult.created} added, {bulkResult.failed.length} failed:</p>
                <ul className="list-inside list-disc">
                  {bulkResult.failed.map((f) => <li key={f.row}>Row {f.row}: {f.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button variant="outline" onClick={addBulkRow}>+ Add Row</Button>
            <Button onClick={submitBulkRows} disabled={bulkSubmitting || bulkRows.some((r) => !r.code || !r.name_en)}>
              {bulkSubmitting ? "Submitting..." : `Submit ${bulkRows.length} Course(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!prereqCourseId} onOpenChange={(open) => !open && setPrereqCourseId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Prerequisites — {prereqCourse?.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!prereqCourse?.required_by.length && <p className="text-sm text-muted-foreground">No prerequisites set.</p>}
            {prereqCourse?.required_by.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{r.prerequisite_course.code} - {r.prerequisite_course.name_en} (Sem {r.prerequisite_course.semester_number})</span>
                <Button size="sm" variant="outline" onClick={() => removePrereqMutation.mutate(r.id)}>Remove</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <select className="flex-1 rounded-md border px-3 py-2 text-sm" value={newPrereqId} onChange={(e) => setNewPrereqId(e.target.value)}>
                <option value="">Select a course...</option>
                {courses?.filter((c) => c.id !== prereqCourseId && !prereqCourse?.required_by.some((r) => r.prerequisite_course.id === c.id)).map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name_en} (Sem {c.semester_number})</option>
                ))}
              </select>
              <Button size="sm" onClick={() => addPrereqMutation.mutate()} disabled={!newPrereqId || addPrereqMutation.isPending}>Add</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrereqCourseId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete course"
        description={deleteTarget ? `Delete course "${deleteTarget.name_en}"?` : undefined}
        destructive
        confirmLabel="Delete"
        loading={deleteCourseMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteCourseMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </PageWrapper>
  );
}
