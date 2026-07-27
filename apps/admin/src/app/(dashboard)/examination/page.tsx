"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, CardTitle, Button, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Exam {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  academic_year: { label: string };
  subject_configs: unknown[];
}

export default function ExaminationPage() {
  const { data: exams } = useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: async () => (await api.get("/api/exams")).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Examination"
        breadcrumbs={[{ label: "Examination" }]}
        action={<Link href="/examination/new"><Button>+ Create Exam</Button></Link>}
      />

      {!exams?.length && <EmptyState title="No exams yet" />}

      <div className="grid grid-cols-3 gap-4">
        {exams?.map((e) => (
          <Link key={e.id} href={`/examination/${e.id}`}>
            <Card className="hover:border-primary">
              <CardContent className="space-y-2 pt-6">
                <CardTitle className="text-base">{e.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{e.academic_year.label}</p>
                <p className="text-xs text-muted-foreground">{e.subject_configs.length} subjects configured</p>
                <StatusBadge status={e.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
