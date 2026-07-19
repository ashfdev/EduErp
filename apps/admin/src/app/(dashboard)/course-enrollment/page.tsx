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
  ConfirmDialog,
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
interface ProgramRow {
  id: string;
  name_en: string;
  department_id: string | null;
}
interface DepartmentRow {
  id: string;
  name_en: string;
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
interface SemesterSgpa {
  class_id: string;
  class_name: string;
  semester_number: number;
  sgpa: number;
  credit_hours: number;
}
interface CgpaData {
  cgpa: number | null;
  current_semester: number | null;
  courses: Enrollment[];
  semesters: SemesterSgpa[];
}

const STATUS_OPTIONS = ["ENROLLED", "COMPLETED", "FAILED", "DROPPED", "WITHDRAWN"];

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}
function errCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
}

export default function CourseEnrollmentPage() {
  const queryClient = useQueryClient();

  // Department -> Program pre-filter, before the student search even
  // becomes usable — answers "which department/program's student is this"
  // as the entry point, not an afterthought.
  const [departmentId, setDepartmentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const { data: departments } = useQuery<DepartmentRow[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });
  const { data: programs } = useQuery<ProgramRow[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
  });
  const programsInDepartment = departmentId ? (programs ?? []).filter((p) => p.department_id === departmentId) : programs ?? [];

  const { data: searchResults } = useQuery<{ data: StudentRow[] }>({
    queryKey: ["students", "search", programId, search],
    queryFn: async () => (await api.get("/api/students", { params: { program_id: programId, search, limit: 10 } })).data,
    enabled: !!programId && search.length > 1,
  });

  const { data: cgpaData } = useQuery<CgpaData>({
    queryKey: ["course-enrollments", "cgpa", selectedStudent?.id],
    queryFn: async () => (await api.get(`/api/course-enrollments/student/${selectedStudent!.id}/cgpa`)).data.data,
    enabled: !!selectedStudent,
  });

  const { data: classes } = useQuery<ClassRow[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  // A student can only enroll into their OWN current semester's courses —
  // no class picker needed since there's only ever one valid answer.
  const studentClass = classes?.find((c) => c.id === selectedStudent?.current_class_id);

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [creditCapMessage, setCreditCapMessage] = useState<string | null>(null);

  const { data: coursesForProgram } = useQuery<CourseRow[]>({
    queryKey: ["settings", "courses", studentClass?.program_id],
    queryFn: async () => (await api.get("/api/settings/courses", { params: { program_id: studentClass!.program_id } })).data.data,
    enabled: !!studentClass?.program_id,
  });
  const selectedCourse = coursesForProgram?.find((c) => c.id === courseId);

  const enrollMutation = useMutation({
    mutationFn: (override?: boolean) =>
      api.post("/api/course-enrollments", {
        student_id: selectedStudent!.id,
        course_id: courseId,
        class_id: studentClass!.id,
        academic_year_id: studentClass!.academic_year_id,
        override,
      }),
    onSuccess: () => {
      toast.success("Enrolled");
      queryClient.invalidateQueries({ queryKey: ["course-enrollments", "cgpa", selectedStudent?.id] });
      setEnrollOpen(false);
      setCourseId("");
    },
    onError: (err: unknown) => {
      if (errCode(err) === "CREDIT_CAP_EXCEEDED") {
        setCreditCapMessage(errMsg(err, "Credit cap exceeded"));
        return;
      }
      toast.error(errMsg(err, "Failed to enroll — check prerequisites"));
    },
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
        <CardContent className="space-y-3 pt-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department (optional)</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={departmentId}
                onChange={(e) => { setDepartmentId(e.target.value); setProgramId(""); setSelectedStudent(null); }}
              >
                <option value="">All Departments</option>
                {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Program</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={programId}
                onChange={(e) => { setProgramId(e.target.value); setSelectedStudent(null); }}
              >
                <option value="">Select a program...</option>
                {programsInDepartment.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Find Student</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={programId ? "Search by name, ID, or roll..." : "Select a program first"}
              disabled={!programId}
            />
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
          </div>
        </CardContent>
      </Card>

      {selectedStudent && (
        <>
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{selectedStudent.name_en} <span className="font-mono text-xs text-muted-foreground">{selectedStudent.student_uid}</span></p>
                <p className="text-sm text-muted-foreground">
                  {studentClass?.name_en ?? "No current semester assigned"} · CGPA: {cgpaData?.cgpa?.toFixed(2) ?? "N/A"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEnrollOpen(true)} disabled={!studentClass}>+ Enroll in Course</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change Student</Button>
              </div>
            </CardContent>
          </Card>

          {!!cgpaData?.semesters.length && (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium">Semester-wise SGPA</p>
                <div className="flex flex-wrap gap-2">
                  {cgpaData.semesters.map((s) => (
                    <Badge key={s.class_id} variant="outline">
                      {s.class_name}: {s.sgpa.toFixed(2)} ({s.credit_hours} cr)
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                          <td className="p-2">
                            {e.course.code} - {e.course.name_en}
                            {e.course.credit_hours === 0 && <Badge variant="outline" className="ml-2">Audit</Badge>}
                          </td>
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
            <p className="text-sm text-muted-foreground">
              Enrolling <strong>{selectedStudent?.name_en}</strong> into <strong>{studentClass?.name_en}</strong> — their current semester.
            </p>
            <div className="space-y-1.5">
              <Label>Course</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select...</option>
                {coursesForProgram?.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name_en} ({c.credit_hours === 0 ? "Audit" : `${c.credit_hours} cr`})</option>
                ))}
              </select>
              {selectedCourse?.credit_hours === 0 && <Badge variant="outline">Non-credit / Audit course</Badge>}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => enrollMutation.mutate(undefined)} disabled={enrollMutation.isPending || !courseId}>
              {enrollMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!creditCapMessage}
        onOpenChange={(open) => !open && setCreditCapMessage(null)}
        title="Credit cap exceeded"
        description={creditCapMessage ?? undefined}
        confirmLabel="Continue anyway"
        loading={enrollMutation.isPending}
        onConfirm={() => {
          setCreditCapMessage(null);
          enrollMutation.mutate(true);
        }}
      />
    </PageWrapper>
  );
}
