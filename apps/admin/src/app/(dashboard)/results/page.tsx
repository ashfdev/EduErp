"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageWrapper, PageHeader, Card, CardContent, StatusBadge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Exam {
  id: string;
  name: string;
  status: string;
  academic_year: { label: string };
}

export default function ResultsPage() {
  const t = useTranslations("results");
  const { data: exams, isLoading, isError, error, refetch } = useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: async () => (await api.get("/api/exams")).data.data,
  });

  const completedOrPublished = exams?.filter((e) => e.status === "COMPLETED" || e.status === "PUBLISHED");

  return (
    <PageWrapper>
      <PageHeader title={t("title")} subtitle={t("subtitle")} breadcrumbs={[{ label: "Results" }]} />
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load exams" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!completedOrPublished?.length && <EmptyState title={t("noCompletedExams")} description={t("noCompletedExamsHint")} />}
          <div className="space-y-2">
            {completedOrPublished?.map((e) => (
              <Link key={e.id} href={`/results/${e.id}`}>
                <Card className="hover:border-primary">
                  <CardContent className="flex items-center justify-between pt-6">
                    <div>
                      <p className="font-medium">{e.name}</p>
                      <p className="text-sm text-muted-foreground">{e.academic_year.label}</p>
                    </div>
                    <StatusBadge status={e.status} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
