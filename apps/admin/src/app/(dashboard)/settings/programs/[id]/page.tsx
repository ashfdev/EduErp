"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  EmptyState,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@education-erp/ui";
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
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: programs } = useQuery<ProgramRow[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
  });
  const program = programs?.find((p) => p.id === id);

  const { data: courses } = useQuery<CourseRow[]>({
    queryKey: ["settings", "courses", id],
    queryFn: async () => (await api.get("/api/settings/courses", { params: { program_id: id } })).data.data,
  });

  // Add-course dialog
  const [courseOpen, setCourseOpen] = useState(false);
  const [semesterNumber, setSemesterNumber] = useState(1);
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [creditHours, setCreditHours] = useState(3);
  const [courseType, setCourseType] = useState("THEORY");

  const createCourseMutation = useMutation({
    mutationFn: () =>
      api.post("/api/settings/courses", {
        program_id: id,
        semester_number: semesterNumber,
        code,
        name_en: nameEn,
        credit_hours: creditHours,
        course_type: courseType,
      }),
    onSuccess: () => {
      toast.success("Course added");
      queryClient.invalidateQueries({ queryKey: ["settings", "courses", id] });
      setCourseOpen(false);
      setSemesterNumber(1); setCode(""); setNameEn(""); setCreditHours(3); setCourseType("THEORY");
    },
    onError: (err: unknown) => toast.error(errMsg(err, "Failed to add course")),
  });

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
  });

  return (
    <PageWrapper>
      <PageHeader
        title={program?.name_en ?? "Program"}
        subtitle={program ? `${program.code} · ${program.department?.name_en ?? "No department"} · ${program.duration_semesters} semesters` : undefined}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Programs & Courses", href: "/settings/programs" }, { label: program?.name_en ?? "" }]}
        action={<Button onClick={() => setCourseOpen(true)}>+ Add Course</Button>}
      />

      {!courses?.length && <EmptyState title="No courses yet" description="Add courses semester by semester, then wire up prerequisites between them." />}

      {!!courses?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Sem</th>
                  <th className="p-2">Code</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Credit Hours</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Prerequisites</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-2">{c.semester_number}</td>
                    <td className="p-2 font-mono text-xs">{c.code}</td>
                    <td className="p-2">{c.name_en}</td>
                    <td className="p-2">{c.credit_hours}</td>
                    <td className="p-2"><Badge variant="outline">{c.course_type}</Badge></td>
                    <td className="p-2">
                      {c.required_by.length ? c.required_by.map((r) => r.prerequisite_course.code).join(", ") : <span className="text-muted-foreground">None</span>}
                    </td>
                    <td className="p-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPrereqCourseId(c.id)}>Prerequisites</Button>
                      <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete course "${c.name_en}"?`)) deleteCourseMutation.mutate(c.id); }}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={courseOpen} onOpenChange={setCourseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Course</DialogTitle></DialogHeader>
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
            <Button onClick={() => createCourseMutation.mutate()} disabled={createCourseMutation.isPending || !code || !nameEn}>
              {createCourseMutation.isPending ? "Adding..." : "Add Course"}
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
    </PageWrapper>
  );
}
