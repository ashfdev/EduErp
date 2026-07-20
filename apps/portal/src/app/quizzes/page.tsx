"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, EmptyState, ErrorState } from "@education-erp/ui";

interface QuizRow {
  id: string;
  title: string;
  duration_minutes: number;
  subject: { name_en: string };
  _count: { questions: number };
}

function QuizzesContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("quizzes");
  const tCommon = useTranslations("common");
  const { data, isLoading, isError, refetch } = useQuery<QuizRow[]>({
    queryKey: ["portal", "quizzes", activeStudentId],
    queryFn: async () => (await api.get("/api/portal/quizzes", { params: { student_id: activeStudentId } })).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {!data?.length && <EmptyState title={t("noQuizzes")} />}
      {data?.map((q) => (
        <Link key={q.id} href={`/quizzes/${q.id}`}>
          <Card className="hover:border-primary">
            <CardContent className="pt-6">
              <p className="font-medium">{q.title}</p>
              <p className="text-xs text-gray-500">{q.subject.name_en} · {t("questionsCount", { count: q._count.questions })} · {t("durationMin", { minutes: q.duration_minutes })}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function QuizzesPage() {
  return (
    <PortalShell>
      <QuizzesContent />
    </PortalShell>
  );
}
