"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Issue {
  id: string;
  due_date: string;
  book: { title: string; author: string };
  person_id: string;
  person_type: string;
}

export default function ReturnBookPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: issues } = useQuery<Issue[]>({
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
  });

  const filtered = issues?.filter((i) => !search || i.book.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageWrapper>
      <PageHeader title="Return Book" breadcrumbs={[{ label: "Library", href: "/library" }, { label: "Return" }]} />
      <Input placeholder="Filter by book title..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {!filtered?.length && <EmptyState title="No books currently issued" />}
      {!!filtered?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Book</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => {
                  const overdue = new Date(i.due_date) < new Date();
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{i.book.title} — {i.book.author}</TableCell>
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
    </PageWrapper>
  );
}
