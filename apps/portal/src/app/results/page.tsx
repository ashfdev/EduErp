"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, StatusBadge, LoadingSpinner } from "@education-erp/ui";

interface ResultSummary {
  exam_id: string;
  exam_name: string;
  total_gpa: number;
  overall_grade: string;
  has_failed: boolean;
}

function ResultsContent() {
  const { activeStudentId } = useAuthStore();
  const { data, isLoading } = useQuery<ResultSummary[]>({
    queryKey: ["portal", "results", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/results`)).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Results</h1>
      {!data?.length && <p className="text-sm text-gray-500">No published results yet.</p>}
      {data?.map((r) => (
        <Link key={r.exam_id} href={`/results/${r.exam_id}`}>
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{r.exam_name}</p>
                <p className="text-xs text-gray-500">{r.has_failed ? "Failed" : `GPA ${r.total_gpa}`}</p>
              </div>
              <StatusBadge status={r.has_failed ? "FAILED" : r.overall_grade} />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <PortalShell>
      <ResultsContent />
    </PortalShell>
  );
}
