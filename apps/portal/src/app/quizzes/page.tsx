"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface QuizRow {
  id: string;
  title: string;
  duration_minutes: number;
  subject: { name_en: string };
  _count: { questions: number };
}

function QuizzesContent() {
  const { activeStudentId } = useAuthStore();
  const { data, isLoading } = useQuery<QuizRow[]>({
    queryKey: ["portal", "quizzes", activeStudentId],
    queryFn: async () => (await api.get("/api/portal/quizzes", { params: { student_id: activeStudentId } })).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Quizzes</h1>
      {!data?.length && <EmptyState title="No quizzes available" />}
      {data?.map((q) => (
        <Link key={q.id} href={`/quizzes/${q.id}`}>
          <Card className="hover:border-primary">
            <CardContent className="pt-6">
              <p className="font-medium">{q.title}</p>
              <p className="text-xs text-gray-500">{q.subject.name_en} · {q._count.questions} questions · {q.duration_minutes} min</p>
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
