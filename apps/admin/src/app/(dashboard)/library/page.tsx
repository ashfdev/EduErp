"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Issue {
  id: string;
  status: string;
}
interface FineReport {
  total_fines: number;
  outstanding: number;
}
interface Meta {
  total: number;
}

export default function LibraryDashboardPage() {
  const { data: booksMeta } = useQuery<Meta>({ queryKey: ["library", "books", "meta"], queryFn: async () => (await api.get("/api/library/books", { params: { limit: 1 } })).data.meta });
  const { data: activeIssues } = useQuery<Issue[]>({ queryKey: ["library", "issues", "active"], queryFn: async () => (await api.get("/api/library/issues", { params: { status: "ISSUED" } })).data.data });
  const { data: overdue } = useQuery<Issue[]>({ queryKey: ["library", "issues", "overdue"], queryFn: async () => (await api.get("/api/library/issues", { params: { overdue: "true" } })).data.data });
  const { data: fineReport } = useQuery<FineReport>({ queryKey: ["library", "fine-report"], queryFn: async () => (await api.get("/api/library/reports/fine-report")).data.data });

  return (
    <PageWrapper>
      <PageHeader
        title="Library"
        breadcrumbs={[{ label: "Library" }]}
        action={
          <div className="flex gap-2">
            <Link href="/library/issue"><Button variant="outline">Issue Book</Button></Link>
            <Link href="/library/return"><Button variant="outline">Return Book</Button></Link>
            <Link href="/library/books"><Button>Book Catalog</Button></Link>
          </div>
        }
      />
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{booksMeta?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Books</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{activeIssues?.length ?? 0}</p><p className="text-sm text-muted-foreground">Active Issues</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold text-red-600">{overdue?.length ?? 0}</p><p className="text-sm text-muted-foreground">Overdue</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">৳{fineReport?.outstanding ?? 0}</p><p className="text-sm text-muted-foreground">Outstanding Fines</p></CardContent></Card>
      </div>
      <Link href="/library/reports" className="text-sm text-primary hover:underline">View Overdue &amp; Fine Reports →</Link>
    </PageWrapper>
  );
}
