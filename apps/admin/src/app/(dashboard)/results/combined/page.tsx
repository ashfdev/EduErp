"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Label, Textarea, Badge, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  RecordPickerDialog, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface YearOption {
  id: string;
  label: string;
  is_active: boolean;
}
interface StudentOption {
  id: string;
  name_en: string;
  student_uid: string;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
}
interface ContributingExam {
  id: string;
  name: string;
  exam_type_name: string;
  weight: number;
  published: boolean;
}
interface CombinedSubjectRow {
  subject_id: string;
  subject_name: string;
  contributions: { exam_name: string; weight: number; marks_total: number | null; full_marks: number; percentage: number | null }[];
  blended_percentage: number | null;
  blended_grade_letter: string | null;
  blended_grade_point: number | null;
}
interface CombinedResult {
  student: { id: string; name_en: string; student_uid: string; current_roll_no: string | null };
  academic_year_label: string;
  contributing_exams: ContributingExam[];
  subjects: CombinedSubjectRow[];
  overall_percentage: number | null;
  overall_gpa: number | null;
  overall_grade_letter: string | null;
  has_failed: boolean;
  attendance: { total_days: number; present: number; absent: number; percentage: number } | null;
  extracurricular_remarks: string | null;
}

// Term-Based weighted Combined/Annual Result (Plan Fifteen, Phase I) — the
// admin-facing entry point for the new blended-result engine: pick a
// student + session, review which configured exam types actually blend in
// (and which are still unpublished), optionally note co-curricular remarks,
// then generate the branded PDF.
export default function CombinedResultPage() {
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remarksDraft, setRemarksDraft] = useState("");

  const { data: years } = useQuery<YearOption[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });

  const { data: result, isFetching } = useQuery<CombinedResult>({
    queryKey: ["results", "combined", yearId, student?.id],
    queryFn: async () => (await api.get(`/api/results/combined/${yearId}/${student!.id}`)).data.data,
    enabled: !!yearId && !!student,
  });

  useEffect(() => {
    setRemarksDraft("");
  }, [yearId, student?.id]);

  const saveRemarksMutation = useMutation({
    mutationFn: () => api.put(`/api/results/combined/${yearId}/${student!.id}/extracurricular`, { remarks: remarksDraft }),
    onSuccess: () => {
      toast.success("Remarks saved");
      queryClient.invalidateQueries({ queryKey: ["results", "combined", yearId, student?.id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save remarks"),
  });

  async function download() {
    try {
      const res = await api.get(`/api/documents/result/combined/${yearId}/${student!.id}`, { params: { download: "true" }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `combined-result-${student!.student_uid}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(extractErrorMessage(err) ?? "Failed to generate PDF");
    }
  }

  const noExamTypesConfigured = result && !result.contributing_exams.length;

  return (
    <PageWrapper>
      <PageHeader
        title="Combined / Annual Result"
        subtitle="Blends every exam type with a 'Weight in Annual %' (Settings → Exam Types) into one weighted result — never mutates the underlying exam results."
        breadcrumbs={[{ label: "Results", href: "/results" }, { label: "Combined" }]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Session</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select session..." /></SelectTrigger>
            <SelectContent>{years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (active)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Student</Label>
          {student ? (
            <div className="flex items-center gap-2">
              <span className="rounded-md border bg-muted px-3 py-2 text-sm">{student.name_en} ({student.student_uid})</span>
              <Button variant="outline" size="sm" onClick={() => setStudent(null)}>Change</Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setPickerOpen(true)}>Choose Student…</Button>
          )}
        </div>
        {result && (
          <Button onClick={download} disabled={noExamTypesConfigured}>Download PDF</Button>
        )}
      </div>

      {yearId && student && isFetching && <p className="text-sm text-muted-foreground">Loading...</p>}

      {noExamTypesConfigured && (
        <EmptyState
          title="No exam types are configured to blend"
          description="Set a 'Weight in Annual %' greater than 0 for at least one Exam Type in Settings → Exam Types to use this feature."
        />
      )}

      {result && !!result.contributing_exams.length && (
        <>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm font-medium">Contributing Exams — {result.academic_year_label}</p>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Exam</TableHead><TableHead>Type</TableHead><TableHead>Weight</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {result.contributing_exams.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{e.exam_type_name}</TableCell>
                      <TableCell>{e.weight}%</TableCell>
                      <TableCell>{e.published ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Not yet published</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {!result.subjects.length ? (
            <EmptyState title="No published results yet" description="None of the contributing exams have a published result for this student's class/group yet." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-3 text-sm font-medium">Blended Subject Results</p>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Subject</TableHead><TableHead>Contributions</TableHead><TableHead>Blended %</TableHead><TableHead>Grade</TableHead><TableHead>GP</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.subjects.map((s) => (
                      <TableRow key={s.subject_id}>
                        <TableCell className="font-medium">{s.subject_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.contributions.map((c) => `${c.exam_name}: ${c.percentage ?? "—"}% (×${c.weight}%)`).join(" · ")}
                        </TableCell>
                        <TableCell>{s.blended_percentage ?? "—"}%</TableCell>
                        <TableCell>{s.blended_grade_letter ?? "—"}</TableCell>
                        <TableCell>{s.blended_grade_point ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3 flex gap-4 border-t pt-3 text-sm font-semibold">
                  <span>Overall: {result.has_failed ? "FAILED" : `${result.overall_grade_letter} (GPA ${result.overall_gpa})`}</span>
                  <span className="text-muted-foreground">Percentage: {result.overall_percentage ?? "—"}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm font-medium">Attendance (informational only — never affects the blended grade)</p>
              {result.attendance ? (
                <p className="text-sm text-muted-foreground">
                  Working Days: {result.attendance.total_days} · Present: {result.attendance.present} ({result.attendance.percentage}%) · Absent: {result.attendance.absent}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No attendance data for this session.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm font-medium">Extracurricular / Co-curricular Remarks (informational only)</p>
              <Textarea
                value={remarksDraft || result.extracurricular_remarks || ""}
                onChange={(e) => setRemarksDraft(e.target.value)}
                placeholder="e.g. Represented the school in the district science fair; active member of the debate club."
                rows={3}
              />
              <Button size="sm" onClick={() => saveRemarksMutation.mutate()} disabled={saveRemarksMutation.isPending}>
                {saveRemarksMutation.isPending ? "Saving..." : "Save Remarks"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <RecordPickerDialog<StudentOption>
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose a Student"
        searchPlaceholder="Search by name or student ID..."
        getKey={(s) => s.id}
        fetchResults={async ({ search, page }) => (await api.get("/api/students", { params: { search: search || undefined, page, limit: 10 } })).data}
        renderRow={(s) => (
          <div>
            <p className="font-medium">{s.name_en}</p>
            <p className="text-xs text-muted-foreground">
              {s.student_uid}{s.current_class && ` · ${s.current_class.name_en}`}{s.current_section && ` ${s.current_section.name}`}
            </p>
          </div>
        )}
        onSelect={(s) => {
          setStudent(s);
          setRemarksDraft("");
          setPickerOpen(false);
        }}
      />
    </PageWrapper>
  );
}
