"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, SearchInput, StatusBadge, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Issue {
  id: string;
  due_date: string;
  book: { title: string; author: string };
  person_id: string;
  person_type: string;
  person_name: string | null;
  person_uid: string | null;
}

export default function ReturnBookPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: issues, isLoading, isError, error, refetch } = useQuery<Issue[]>({
    queryKey: ["library", "issues", "issued"],
    queryFn: async () => (await api.get("/api/library/issues", { params: { status: "ISSUED" } })).data.data,
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/library/issues/${id}/return`, {}),
    onSuccess: (res) => {
      const fine = res.data.data.fine_amount;
      toast.success(fine > 0 ? `Returned — fine of ৳${fine} applies` : "Returned, no fine");
      queryClient.invalidateQueries({ queryKey: ["library", "issues"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to return book"),
  });

  const filtered = issues?.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.book.title.toLowerCase().includes(q) || (i.person_name ?? "").toLowerCase().includes(q) || (i.person_uid ?? "").toLowerCase().includes(q);
  });

  return (
    <PageWrapper>
      <PageHeader title="Return Book" breadcrumbs={[{ label: "Library", href: "/library" }, { label: "Return" }]} />
      <SearchInput placeholder="Filter by book title or borrower name..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load issued books" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!filtered?.length && <EmptyState title="No books currently issued" />}
      {!!filtered?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Book</TableHead><TableHead>Borrower</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => {
                  const overdue = new Date(i.due_date) < new Date();
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{i.book.title} — {i.book.author}</TableCell>
                      <TableCell>{i.person_name ?? "-"} <span className="font-mono text-xs text-muted-foreground">{i.person_uid}</span></TableCell>
                      <TableCell>{new Date(i.due_date).toLocaleDateString()}</TableCell>
                      <TableCell>{overdue ? <StatusBadge status="OVERDUE" /> : <StatusBadge status="ISSUED" />}</TableCell>
                      <TableCell><Button size="sm" onClick={() => returnMutation.mutate(i.id)}>Mark Returned</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </PageWrapper>
  );
}
