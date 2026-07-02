"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Exam {
  id: string;
  name: string;
  status: string;
  academic_year: { label: string };
  exam_type_config: { name: string };
}

export default function ResultsPage() {
  const { data: exams } = useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: async () => (await api.get("/api/exams")).data.data,
  });

  const completedOrPublished = exams?.filter((e) => e.status === "COMPLETED" || e.status === "PUBLISHED");

  return (
    <PageWrapper>
      <PageHeader title="Results" subtitle="View, analyze, and publish exam results" breadcrumbs={[{ label: "Results" }]} />
      {!completedOrPublished?.length && <EmptyState title="No completed exams yet" description="Results become available once an exam moves to Completed status." />}
      <div className="space-y-2">
        {completedOrPublished?.map((e) => (
          <Link key={e.id} href={`/results/${e.id}`}>
            <Card className="hover:border-primary">
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-sm text-muted-foreground">{e.exam_type_config.name} · {e.academic_year.label}</p>
                </div>
                <StatusBadge status={e.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
