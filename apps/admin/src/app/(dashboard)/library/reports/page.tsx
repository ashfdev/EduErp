"use client";

import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Button } from "@education-erp/ui";
import { api } from "@/lib/api";

interface OverdueIssue {
  id: string;
  book: { title: string };
  person: { name: string; uid: string } | null;
  days_late: number;
  projected_fine: number;
}
interface FineReport {
  total_fines: number;
  collected: number;
  outstanding: number;
  count: number;
}

export default function LibraryReportsPage() {
  const { data: overdue } = useQuery<OverdueIssue[]>({ queryKey: ["library", "reports", "overdue"], queryFn: async () => (await api.get("/api/library/reports/overdue")).data.data });
  const { data: fineReport } = useQuery<FineReport>({ queryKey: ["library", "reports", "fine"], queryFn: async () => (await api.get("/api/library/reports/fine-report")).data.data });

  async function downloadOverdueExcel() {
    const res = await api.get("/api/library/issues/export", { params: { overdue: "true" }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Overdue_Books.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Library Reports"
        breadcrumbs={[{ label: "Library", href: "/library" }, { label: "Reports" }]}
        action={<Button variant="outline" onClick={downloadOverdueExcel}>Export Overdue (Excel)</Button>}
      />
      <Tabs defaultValue="overdue">
        <TabsList>
          <TabsTrigger value="overdue">Overdue Books</TabsTrigger>
          <TabsTrigger value="fines">Fine Report</TabsTrigger>
        </TabsList>
        <TabsContent value="overdue">
          {!overdue?.length && <EmptyState title="No overdue books" />}
          {!!overdue?.length && (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Book</th><th className="p-2">Borrower</th><th className="p-2">Days Late</th><th className="p-2">Projected Fine</th></tr></thead>
                  <tbody>
                    {overdue.map((o) => (
                      <tr key={o.id} className="border-b">
                        <td className="p-2">{o.book.title}</td>
                        <td className="p-2">{o.person?.name ?? "-"} <span className="font-mono text-xs text-muted-foreground">{o.person?.uid}</span></td>
                        <td className="p-2 text-red-600">{o.days_late}</td>
                        <td className="p-2">৳{o.projected_fine}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="fines">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">৳{fineReport?.total_fines ?? 0}</p><p className="text-sm text-muted-foreground">Total Fines</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold text-emerald-600">৳{fineReport?.collected ?? 0}</p><p className="text-sm text-muted-foreground">Collected</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold text-red-600">৳{fineReport?.outstanding ?? 0}</p><p className="text-sm text-muted-foreground">Outstanding</p></CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
