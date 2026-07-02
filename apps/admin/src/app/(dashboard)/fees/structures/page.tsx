"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

const CATEGORIES = ["ADMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

interface FeeStructure {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  due_day: number | null;
}
interface YearOption { id: string; label: string; is_active: boolean }

export default function FeeStructuresPage() {
  const queryClient = useQueryClient();
  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const activeYear = years?.find((y) => y.is_active) ?? years?.[0];

  const { data: structures } = useQuery<FeeStructure[]>({
    queryKey: ["fees", "structures", activeYear?.id],
    queryFn: async () => (await api.get("/api/fees/structures", { params: { academic_year_id: activeYear?.id } })).data.data,
    enabled: !!activeYear,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "TUITION", amount: 0, frequency: "MONTHLY", due_day: 10 });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/fees/structures", { ...form, academic_year_id: activeYear?.id }),
    onSuccess: () => {
      toast.success("Fee structure created");
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/fees/structures/${id}`),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["fees", "structures"] });
    },
    onError: () => toast.error("This structure has invoices generated and cannot be deleted"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Fee Structures" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Structures" }]} action={<Button onClick={() => setOpen(true)}>+ Add Fee Structure</Button>} />

      {!structures?.length && <EmptyState title="No fee structures yet" />}
      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Name</th><th className="p-2">Category</th><th className="p-2">Amount</th><th className="p-2">Frequency</th><th className="p-2"></th></tr></thead>
            <tbody>
              {structures?.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="p-2">{s.name}</td>
                  <td className="p-2"><Badge variant="outline">{s.category}</Badge></td>
                  <td className="p-2">৳{s.amount}</td>
                  <td className="p-2">{s.frequency}</td>
                  <td className="p-2"><Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}>Delete</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fee Structure</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly Tuition Fee" /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="ONE_TIME">One Time</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Due Day of Month</Label><Input type="number" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
