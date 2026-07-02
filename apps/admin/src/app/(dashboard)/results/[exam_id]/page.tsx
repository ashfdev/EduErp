"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from "@education-erp/ui";
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

export default function ExamResultsPage() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const [classId, setClassId] = useState("");

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

  return (
    <PageWrapper>
      <PageHeader title="Exam Results" breadcrumbs={[{ label: "Results", href: "/results" }, { label: "Detail" }]} />

      <select className="w-64 rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
        <option value="">Select Class...</option>
        {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
      </select>

      {classId && (
        <Tabs defaultValue="merit">
          <TabsList>
            <TabsTrigger value="merit">Merit List</TabsTrigger>
            <TabsTrigger value="analysis">Subject Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="merit">
            {!merit?.length && <EmptyState title="No merit list yet" description="All students may have failed, or results aren't approved." />}
            {!!merit?.length && (
              <Card>
                <CardContent className="pt-6">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Rank</th><th className="p-2">Roll</th><th className="p-2">Name</th><th className="p-2">GPA</th></tr></thead>
                    <tbody>
                      {merit.map((m) => (
                        <tr key={m.student_uid} className="border-b">
                          <td className="p-2 font-semibold">{m.rank}</td>
                          <td className="p-2">{m.roll_no}</td>
                          <td className="p-2">{m.name_en}</td>
                          <td className="p-2">{m.total_gpa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis">
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Subject</th><th className="p-2">Appeared</th><th className="p-2">Passed</th><th className="p-2">Pass Rate</th><th className="p-2">Avg Marks</th></tr></thead>
                  <tbody>
                    {analysis?.map((a) => (
                      <tr key={a.subject_id} className="border-b">
                        <td className="p-2">{a.subject_name}</td>
                        <td className="p-2">{a.appeared}</td>
                        <td className="p-2">{a.passed}</td>
                        <td className="p-2">{a.pass_rate != null ? <StatusBadge status={a.pass_rate >= 80 ? "ACTIVE" : "PENDING"} /> : "—"} {a.pass_rate}%</td>
                        <td className="p-2">{a.average_marks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </PageWrapper>
  );
}
