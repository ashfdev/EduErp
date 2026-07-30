"use client";

import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
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
  const { data: overdue, isLoading, isError, error, refetch } = useQuery<OverdueIssue[]>({ queryKey: ["library", "reports", "overdue"], queryFn: async () => (await api.get("/api/library/reports/overdue")).data.data });
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
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load overdue books" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : (
            <>
          {!overdue?.length && <EmptyState title="No overdue books" />}
          {!!overdue?.length && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Book</TableHead><TableHead>Borrower</TableHead><TableHead>Days Late</TableHead><TableHead>Projected Fine</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdue.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>{o.book.title}</TableCell>
                        <TableCell>{o.person?.name ?? "-"} <span className="font-mono text-xs text-muted-foreground">{o.person?.uid}</span></TableCell>
                        <TableCell className="text-red-600">{o.days_late}</TableCell>
                        <TableCell>৳{o.projected_fine}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
            </>
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
