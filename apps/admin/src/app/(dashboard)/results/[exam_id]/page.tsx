"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, SearchInput, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
}

interface MeritEntry {
  rank: number;
  roll_no: string | null;
  name_en: string;
  student_uid: string;
  total_gpa: number;
}

interface SubjectAnalysis {
  subject_id: string;
  subject_name: string;
  appeared: number;
  passed: number;
  pass_rate: number | null;
  average_marks: number;
}

interface StudentResult {
  student_id: string;
  student_uid: string;
  name_en: string;
  roll_no: string | null;
  total_gpa: number;
  overall_grade: string | null;
  has_failed: boolean;
  position: number | null;
}

export default function ExamResultsPage() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  const { data: merit } = useQuery<MeritEntry[]>({
    queryKey: ["results", "merit-list", exam_id, classId],
    queryFn: async () => (await api.get(`/api/results/reports/merit-list/${exam_id}/${classId}`)).data.data,
    enabled: !!classId,
  });

  const { data: analysis } = useQuery<SubjectAnalysis[]>({
    queryKey: ["results", "subject-analysis", exam_id, classId],
    queryFn: async () => (await api.get(`/api/results/reports/subject-analysis/${exam_id}/${classId}`)).data.data,
    enabled: !!classId,
  });

  const { data: allStudents } = useQuery<StudentResult[]>({
    queryKey: ["results", "exam", exam_id, classId],
    queryFn: async () => (await api.get(`/api/results/exam/${exam_id}`, { params: { class_id: classId } })).data.data,
    enabled: !!classId,
  });

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return allStudents ?? [];
    const q = search.trim().toLowerCase();
    return (allStudents ?? []).filter((s) => s.name_en.toLowerCase().includes(q) || (s.roll_no ?? "").toLowerCase().includes(q));
  }, [allStudents, search]);

  async function downloadExcel(kind: "tabulation" | "merit") {
    const path = kind === "tabulation" ? `/api/results/tabulation/${exam_id}/${classId}/export` : `/api/results/reports/merit-list/${exam_id}/${classId}/export`;
    const res = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "tabulation" ? "Tabulation.xlsx" : "Merit_List.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Exam Results"
        breadcrumbs={[{ label: "Results", href: "/results" }, { label: "Detail" }]}
        action={
          classId ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => downloadExcel("tabulation")}>Tabulation (Excel)</Button>
              <Button variant="outline" onClick={() => downloadExcel("merit")}>Merit List (Excel)</Button>
            </div>
          ) : undefined
        }
      />

      <select className="w-64 rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
        <option value="">Select Class...</option>
        {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
      </select>

      {classId && (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Students</TabsTrigger>
            <TabsTrigger value="merit">Merit List</TabsTrigger>
            <TabsTrigger value="analysis">Subject Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {!allStudents?.length && <EmptyState title="No results yet" description="Marks may not be entered or approved for this class yet." />}
            {!!allStudents?.length && (
              <>
                <SearchInput placeholder="Search by name or roll..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 max-w-xs" />
                <Card>
                  <CardContent className="pt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Position</TableHead>
                          <TableHead>Roll</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>GPA</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map((s) => (
                          <TableRow key={s.student_id}>
                            <TableCell>{s.has_failed ? "—" : s.position}</TableCell>
                            <TableCell>{s.roll_no}</TableCell>
                            <TableCell>
                              <Link href={`/students/${s.student_id}`} className="hover:underline" target="_blank">{s.name_en}</Link>
                            </TableCell>
                            <TableCell>{s.total_gpa}</TableCell>
                            <TableCell>{s.overall_grade}</TableCell>
                            <TableCell><StatusBadge status={s.has_failed ? "FAILED" : "PASSED"} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="merit">
            {!merit?.length && <EmptyState title="No merit list yet" description="All students may have failed, or results aren't approved." />}
            {!!merit?.length && (
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Rank</TableHead><TableHead>Roll</TableHead><TableHead>Name</TableHead><TableHead>GPA</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {merit.map((m) => (
                        <TableRow key={m.student_uid}>
                          <TableCell className="font-semibold">{m.rank}</TableCell>
                          <TableCell>{m.roll_no}</TableCell>
                          <TableCell>{m.name_en}</TableCell>
                          <TableCell>{m.total_gpa}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Subject</TableHead><TableHead>Appeared</TableHead><TableHead>Passed</TableHead><TableHead>Pass Rate</TableHead><TableHead>Avg Marks</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis?.map((a) => (
                      <TableRow key={a.subject_id}>
                        <TableCell>{a.subject_name}</TableCell>
                        <TableCell>{a.appeared}</TableCell>
                        <TableCell>{a.passed}</TableCell>
                        <TableCell>{a.pass_rate != null ? <StatusBadge status={a.pass_rate >= 80 ? "ACTIVE" : "PENDING"} /> : "—"} {a.pass_rate}%</TableCell>
                        <TableCell>{a.average_marks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </PageWrapper>
  );
}
