"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Badge, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
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

// Mirrors the public site's two nav clusters (About / Academic) so the
// admin's editing surface and the visitor's browsing surface stay
// conceptually aligned — see apps/website/src/components/navbar.tsx.
const ABOUT_KEYS = [
  "about", "history", "mission_vision", "principal_message", "vice_principal_message",
  "chairman_message", "facilities", "achievements", "contact", "admission_info",
];
const ACADEMIC_KEYS = ["course_curriculum", "grading_system", "academic_regulations", "policies"];

function PageGroup({ title, keys, pages }: { title: string; keys: string[]; pages: StaticPageRow[] }) {
  const rows = keys.map((k) => pages.find((p) => p.page_key === k)).filter((p): p is StaticPageRow => !!p);
  if (!rows.length) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-3 gap-4">
        {rows.map((p) => (
          <Link key={p.page_key} href={`/website/pages/${p.page_key}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="space-y-2 pt-6">
                <p className="font-medium">{LABELS[p.page_key] ?? p.page_key}</p>
                {p.title_en ? (
                  <Badge variant="success">Configured</Badge>
                ) : (
                  <Badge variant="warning">Not yet configured</Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function StaticPagesListPage() {
  const { data: pages, isLoading, isError, error, refetch } = useQuery<StaticPageRow[]>({ queryKey: ["website", "pages"], queryFn: async () => (await api.get("/api/website/pages")).data.data });

  return (
    <PageWrapper>
      <PageHeader title="Static Pages" breadcrumbs={[{ label: "Website" }, { label: "Pages" }]} />
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load pages" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <div className="space-y-8">
          <PageGroup title="About" keys={ABOUT_KEYS} pages={pages ?? []} />
          <PageGroup title="Academic" keys={ACADEMIC_KEYS} pages={pages ?? []} />
        </div>
      )}
    </PageWrapper>
  );
}
