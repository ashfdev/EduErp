"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SubjectConfig {
  id: string;
  subject_id: string;
  full_marks_theory: number;
  full_marks_practical: number;
  pass_marks_theory: number;
  pass_marks_practical: number;
  pass_marks_combined: number;
  subject: { name_en: string; class: { name_en: string } };
}

interface Exam {
  id: string;
  name: string;
  status: string;
  subject_configs: SubjectConfig[];
}

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "ACTIVE",
  ACTIVE: "MARK_ENTRY",
  MARK_ENTRY: "COMPLETED",
  COMPLETED: "PUBLISHED",
  PUBLISHED: null,
};

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: exam } = useQuery<Exam>({
    queryKey: ["exams", id],
    queryFn: async () => (await api.get(`/api/exams/${id}`)).data.data,
  });

  const [configs, setConfigs] = useState<Record<string, SubjectConfig> | null>(null);
  const effectiveConfigs = configs ?? Object.fromEntries((exam?.subject_configs ?? []).map((c) => [c.subject_id, c]));

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.put(`/api/exams/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
    onError: () => toast.error("Invalid status transition"),
  });

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/exams/${id}/subject-config`, Object.values(effectiveConfigs).map((c) => ({
        subject_id: c.subject_id,
        full_marks_theory: c.full_marks_theory,
        full_marks_practical: c.full_marks_practical,
        pass_marks_theory: c.pass_marks_theory,
        pass_marks_practical: c.pass_marks_practical,
        pass_marks_combined: c.pass_marks_combined,
      }))),
    onSuccess: () => {
      toast.success("Subject configuration saved");
      queryClient.invalidateQueries({ queryKey: ["exams", id] });
    },
  });

  function updateConfig(subjectId: string, patch: Partial<SubjectConfig>) {
    setConfigs({ ...effectiveConfigs, [subjectId]: { ...effectiveConfigs[subjectId]!, ...patch } });
  }

  if (!exam) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  const next = NEXT_STATUS[exam.status];

  return (
    <PageWrapper>
      <PageHeader
        title={exam.name}
        breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: exam.name }]}
        action={
          <div className="flex gap-2">
            <Link href={`/examination/${id}/seat-plan`}><Button variant="outline">Seat Plan</Button></Link>
            {next && <Button onClick={() => statusMutation.mutate(next)}>Move to {next.replace(/_/g, " ")}</Button>}
          </div>
        }
      />
      <StatusBadge status={exam.status} />

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Subject</th>
                <th className="p-2">Full (Theory)</th>
                <th className="p-2">Full (Practical)</th>
                <th className="p-2">Pass (Theory)</th>
                <th className="p-2">Pass (Practical)</th>
                <th className="p-2">Total Marks</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(effectiveConfigs).map((c) => (
                <tr key={c.subject_id} className="border-b">
                  <td className="p-2">{c.subject.name_en}</td>
                  <td className="p-1"><Input type="number" className="h-8 w-24" value={c.full_marks_theory} onChange={(e) => updateConfig(c.subject_id, { full_marks_theory: Number(e.target.value) })} /></td>
                  <td className="p-1"><Input type="number" className="h-8 w-24" value={c.full_marks_practical} onChange={(e) => updateConfig(c.subject_id, { full_marks_practical: Number(e.target.value) })} /></td>
                  <td className="p-1"><Input type="number" className="h-8 w-24" value={c.pass_marks_theory} onChange={(e) => updateConfig(c.subject_id, { pass_marks_theory: Number(e.target.value) })} /></td>
                  <td className="p-1"><Input type="number" className="h-8 w-24" value={c.pass_marks_practical} onChange={(e) => updateConfig(c.subject_id, { pass_marks_practical: Number(e.target.value) })} /></td>
                  <td className="p-2 font-medium">{c.full_marks_theory + c.full_marks_practical}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="mt-4" size="sm" onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending}>
            Save Configuration
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
