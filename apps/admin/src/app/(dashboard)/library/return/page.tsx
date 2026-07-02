"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState } from "@education-erp/ui";
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
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Book</th><th className="p-2">Due Date</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {filtered.map((i) => {
                  const overdue = new Date(i.due_date) < new Date();
                  return (
                    <tr key={i.id} className="border-b">
                      <td className="p-2">{i.book.title} — {i.book.author}</td>
                      <td className="p-2">{new Date(i.due_date).toLocaleDateString()}</td>
                      <td className="p-2">{overdue ? <StatusBadge status="OVERDUE" /> : <StatusBadge status="ISSUED" />}</td>
                      <td className="p-2"><Button size="sm" onClick={() => returnMutation.mutate(i.id)}>Mark Returned</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
