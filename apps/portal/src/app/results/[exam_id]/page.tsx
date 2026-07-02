"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner } from "@education-erp/ui";

interface ResultDetail {
  exam_id: string;
  exam_name: string;
  subjects: { subject_name: string; marks_theory: number | null; marks_practical: number | null; marks_total: number | null; grade_letter: string | null; is_absent: boolean }[];
  total_gpa: number;
  overall_grade: string;
  has_failed: boolean;
}

function ResultDetailContent() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const { activeStudentId } = useAuthStore();

  const { data, isLoading } = useQuery<ResultDetail[]>({
    queryKey: ["portal", "results", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/results`)).data.data,
    enabled: !!activeStudentId,
  });

  const result = data?.find((r) => r.exam_id === exam_id);

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;
  if (!result) return <p className="p-4 text-sm text-gray-500">Result not found.</p>;

  async function printCard() {
    const res = await api.get(`/api/portal/student/${activeStudentId}/results/${exam_id}/marksheet`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">{result.exam_name}</h1>
      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="p-1">Subject</th><th className="p-1">Total</th><th className="p-1">Grade</th></tr></thead>
            <tbody>
              {result.subjects.map((s, i) => (
                <tr key={i} className="border-b">
                  <td className="p-1">{s.subject_name}</td>
                  <td className="p-1">{s.is_absent ? "Absent" : s.marks_total}</td>
                  <td className="p-1">{s.grade_letter}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-sm">
            <p>Total GPA: <strong>{result.total_gpa}</strong></p>
            <p>Overall Grade: <strong>{result.overall_grade}</strong></p>
          </div>
        </CardContent>
      </Card>
      <Button className="w-full" onClick={printCard}>Print Result Card</Button>
    </div>
  );
}

export default function ResultDetailPage() {
  return (
    <PortalShell>
      <ResultDetailContent />
    </PortalShell>
  );
}
