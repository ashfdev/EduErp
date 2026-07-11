"use client";

import { useState } from "react";
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
  Badge,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
  current_class_id: string | null;
}
interface ClassRow {
  id: string;
  name_en: string;
  program_id: string | null;
  academic_year_id: string;
}
interface CourseRow {
  id: string;
  code: string;
  name_en: string;
  credit_hours: number;
  semester_number: number;
}
interface Enrollment {
  id: string;
  status: string;
  marks_total: number | null;
  grade_letter: string | null;
  grade_point: number | null;
  course: { code: string; name_en: string; credit_hours: number; semester_number: number };
}
interface CgpaData {
  cgpa: number | null;
  current_semester: number | null;
  courses: Enrollment[];
}

const STATUS_OPTIONS = ["ENROLLED", "COMPLETED", "FAILED", "DROPPED", "WITHDRAWN"];

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

export default function CourseEnrollmentPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const { data: searchResults } = useQuery<{ data: StudentRow[] }>({
    queryKey: ["students", "search", search],
    queryFn: async () => (await api.get("/api/students", { params: { search, limit: 10 } })).data,
    enabled: search.length > 1,
  });

  const { data: cgpaData } = useQuery<CgpaData>({
    queryKey: ["course-enrollments", "cgpa", selectedStudent?.id],
    queryFn: async () => (await api.get(`/api/course-enrollments/student/${selectedStudent!.id}/cgpa`)).data.data,
    enabled: !!selectedStudent,
  });

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [courseId, setCourseId] = useState("");

  const { data: classes } = useQuery<ClassRow[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const programClasses = (classes ?? []).filter((c) => c.program_id);
  const selectedClass = programClasses.find((c) => c.id === classId);

  const { data: coursesForProgram } = useQuery<CourseRow[]>({
    queryKey: ["settings", "courses", selectedClass?.program_id],
    queryFn: async () => (await api.get("/api/settings/courses", { params: { program_id: selectedClass!.program_id } })).data.data,
    enabled: !!selectedClass?.program_id,
  });

  const enrollMutation = useMutation({
    mutationFn: () =>
      api.post("/api/course-enrollments", {
        student_id: selectedStudent!.id,
        course_id: courseId,
        class_id: classId,
        academic_year_id: selectedClass!.academic_year_id,
      }),
    onSuccess: () => {
      toast.success("Enrolled");
      queryClient.invalidateQueries({ queryKey: ["course-enrollments", "cgpa", selectedStudent?.id] });
      setEnrollOpen(false);
      setClassId(""); setCourseId("");
    },
    onError: (err: unknown) => toast.error(errMsg(err, "Failed to enroll — check prerequisites")),
  });

  // Grade entry
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { marks_total?: number; status?: string }>>({});
  const gradeMutation = useMutation({
    mutationFn: ({ enrollmentId, data }: { enrollmentId: string; data: { marks_total?: number; status?: string } }) =>
      api.put(`/api/course-enrollments/${enrollmentId}`, data),
    onSuccess: () => {
      toast.success("Grade saved");
      queryClient.invalidateQueries({ queryKey: ["course-enrollments", "cgpa", selectedStudent?.id] });
    },
    onError: (err: unknown) => toast.error(errMsg(err, "Failed to save grade")),
  });

  return (
    <PageWrapper>
      <PageHeader title="Course Enrollment" subtitle="University-mode course enrollment, grading, and CGPA" breadcrumbs={[{ label: "Course Enrollment" }]} />

      <Card>
        <CardContent className="pt-6">
          <Label>Find Student</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, or roll..." />
          {!!searchResults?.data.length && !selectedStudent && (
            <div className="mt-2 space-y-1">
              {searchResults.data.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStudent(s); setSearch(""); }}
                  className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent"
                >
                  {s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student_uid}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedStudent && (
        <>
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{selectedStudent.name_en} <span className="font-mono text-xs text-muted-foreground">{selectedStudent.student_uid}</span></p>
                <p className="text-sm text-muted-foreground">
                  CGPA: {cgpaData?.cgpa?.toFixed(2) ?? "N/A"} {cgpaData?.current_semester ? `· Semester ${cgpaData.current_semester}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEnrollOpen(true)}>+ Enroll in Course</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change Student</Button>
              </div>
            </CardContent>
          </Card>

          {!cgpaData?.courses.length && <EmptyState title="No course enrollments yet" />}
          {!!cgpaData?.courses.length && (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Sem</th>
                      <th className="p-2">Course</th>
                      <th className="p-2">Credit Hours</th>
                      <th className="p-2">Marks</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Grade</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cgpaData.courses.map((e) => {
                      const draft = gradeDrafts[e.id] ?? {};
                      return (
                        <tr key={e.id} className="border-b">
                          <td className="p-2">{e.course.semester_number}</td>
                          <td className="p-2">{e.course.code} - {e.course.name_en}</td>
                          <td className="p-2">{e.course.credit_hours}</td>
                          <td className="p-1">
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-20"
                              value={draft.marks_total ?? e.marks_total ?? ""}
                              onChange={(ev) => setGradeDrafts((prev) => ({ ...prev, [e.id]: { ...prev[e.id], marks_total: Number(ev.target.value) } }))}
                            />
                          </td>
                          <td className="p-1">
                            <select
                              className="h-8 rounded-md border px-2 text-sm"
                              value={draft.status ?? e.status}
                              onChange={(ev) => setGradeDrafts((prev) => ({ ...prev, [e.id]: { ...prev[e.id], status: ev.target.value } }))}
                            >
                              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="p-2">{e.grade_letter && <Badge variant="outline">{e.grade_letter} ({e.grade_point})</Badge>}</td>
                          <td className="p-1">
                            <Button
                              size="sm"
                              onClick={() => gradeMutation.mutate({ enrollmentId: e.id, data: draft })}
                              disabled={gradeMutation.isPending || !draft.marks_total && !draft.status}
                            >
                              Save
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enroll in Course</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Semester (Class)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setCourseId(""); }}>
                <option value="">Select...</option>
                {programClasses.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Course</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={!classId}>
                <option value="">Select...</option>
                {coursesForProgram?.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name_en} ({c.credit_hours} cr)</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending || !classId || !courseId}>
              {enrollMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
