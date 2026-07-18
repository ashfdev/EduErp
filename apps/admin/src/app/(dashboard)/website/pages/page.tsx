"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaticPageRow {
  page_key: string;
  title_en: string | null;
}

const LABELS: Record<string, string> = {
  about: "About Us",
  history: "History",
  mission_vision: "Mission & Vision",
  principal_message: "Principal's Message",
  vice_principal_message: "Vice Principal's Message",
  chairman_message: "Chairman's Message",
  facilities: "Facilities",
  achievements: "Achievements",
  contact: "Contact Info",
  admission_info: "Admission Info",
  course_curriculum: "Course Curriculum",
  grading_system: "Grading System",
  academic_regulations: "Academic Regulations",
  policies: "Policies",
};

export default function StaticPagesListPage() {
  const { data: pages } = useQuery<StaticPageRow[]>({ queryKey: ["website", "pages"], queryFn: async () => (await api.get("/api/website/pages")).data.data });

  return (
    <PageWrapper>
      <PageHeader title="Static Pages" breadcrumbs={[{ label: "Website" }, { label: "Pages" }]} />
      <div className="grid grid-cols-3 gap-4">
        {pages?.map((p) => (
          <Link key={p.page_key} href={`/website/pages/${p.page_key}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="pt-6">
                <p className="font-medium">{LABELS[p.page_key] ?? p.page_key}</p>
                <p className="text-sm text-muted-foreground">{p.title_en || "Not yet configured"}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
