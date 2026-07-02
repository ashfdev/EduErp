"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
}
interface Invoice {
  id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  status: string;
  due_date: string;
}

export default function CollectFeePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", search],
    queryFn: async () => (await api.get("/api/students", { params: { search, limit: 5 } })).data.data,
    enabled: search.length > 1,
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["fees", "invoices", "student", selectedStudent?.id],
    queryFn: async () => (await api.get("/api/fees/invoices", { params: { student_id: selectedStudent?.id } })).data.data,
    enabled: !!selectedStudent,
  });

  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const collectMutation = useMutation({
    mutationFn: (invoiceId: string) => api.post("/api/fees/collect", { invoice_id: invoiceId, amount: amounts[invoiceId], gateway: "CASH" }),
    onSuccess: () => {
      toast.success("Payment collected");
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices", "student", selectedStudent?.id] });
    },
    onError: () => toast.error("Failed to collect payment"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Collect Fee" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Collect" }]} />

      {!selectedStudent && (
        <div className="max-w-md space-y-2">
          <Input placeholder="Search student by name or UID..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {students?.map((s) => (
            <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
              {s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student_uid}</span>
            </button>
          ))}
        </div>
      )}

      {selectedStudent && (
        <>
          <div className="flex items-center gap-2">
            <p className="font-medium">{selectedStudent.name_en} ({selectedStudent.student_uid})</p>
            <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change Student</Button>
          </div>

          {!invoices?.length && <EmptyState title="No outstanding invoices" />}
          <div className="space-y-2">
            {invoices?.filter((i) => i.status !== "PAID" && i.status !== "WAIVED").map((inv) => (
              <Card key={inv.id}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div>
                    <p>{inv.description}</p>
                    <p className="text-sm text-muted-foreground">Due ৳{inv.amount_due} · Paid ৳{inv.amount_paid} · Fine ৳{inv.fine_amount}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-28"
                      placeholder="Amount"
                      value={amounts[inv.id] ?? ""}
                      onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.id]: Number(e.target.value) }))}
                    />
                    <Button size="sm" disabled={!amounts[inv.id] || collectMutation.isPending} onClick={() => collectMutation.mutate(inv.id)}>
                      Collect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
