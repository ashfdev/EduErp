"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Switch, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SalaryStructure {
  id: string;
  name: string;
  basic: number;
  house_rent: number;
  medical: number;
  transport: number;
  pf_percentage: number;
  tds_percentage: number;
  is_default: boolean;
}

const emptyForm = { name: "", basic: 0, house_rent: 0, medical: 0, transport: 0, pf_percentage: 0, tds_percentage: 0, is_default: false };

export default function SalaryStructuresPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryStructure | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: structures } = useQuery<SalaryStructure[]>({
    queryKey: ["hr", "salary-structures"],
    queryFn: async () => (await api.get("/api/hr/salary-structures")).data.data,
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(s: SalaryStructure) {
    setEditing(s);
    setForm({ name: s.name, basic: s.basic, house_rent: s.house_rent, medical: s.medical, transport: s.transport, pf_percentage: s.pf_percentage, tds_percentage: s.tds_percentage, is_default: s.is_default });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => (editing ? api.put(`/api/hr/salary-structures/${editing.id}`, form) : api.post("/api/hr/salary-structures", form)),
    onSuccess: () => {
      toast.success(editing ? "Salary structure updated" : "Salary structure created");
      queryClient.invalidateQueries({ queryKey: ["hr", "salary-structures"] });
      setOpen(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save salary structure"),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (s: SalaryStructure) => api.put(`/api/hr/salary-structures/${s.id}`, { is_default: true }),
    onSuccess: () => {
      toast.success("Default salary structure updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "salary-structures"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to set default"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Salary Structures"
        subtitle="Pay scales staff can be assigned to — one can be marked Default, pre-selected when adding new staff"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Salary Structures" }]}
        action={<Button onClick={openCreate}>+ Add Salary Structure</Button>}
      />

      {!structures?.length && <EmptyState title="No salary structures yet" description="Add one so it can be assigned to staff and picked up by Payroll." />}
      {!!structures?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Name</th>
                  <th className="p-2">Basic</th>
                  <th className="p-2">House Rent</th>
                  <th className="p-2">Medical</th>
                  <th className="p-2">Transport</th>
                  <th className="p-2">PF %</th>
                  <th className="p-2">TDS %</th>
                  <th className="p-2">Default</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{s.name} {s.is_default && <Badge variant="success" className="ml-2">Default</Badge>}</td>
                    <td className="p-2">৳{s.basic.toLocaleString()}</td>
                    <td className="p-2">৳{s.house_rent.toLocaleString()}</td>
                    <td className="p-2">৳{s.medical.toLocaleString()}</td>
                    <td className="p-2">৳{s.transport.toLocaleString()}</td>
                    <td className="p-2">{s.pf_percentage}%</td>
                    <td className="p-2">{s.tds_percentage}%</td>
                    <td className="p-2">
                      <Switch checked={s.is_default} disabled={s.is_default || setDefaultMutation.isPending} onCheckedChange={() => setDefaultMutation.mutate(s)} />
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : "Add Salary Structure"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Senior Teacher Scale" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Basic</Label><Input type="number" min={0} value={form.basic} onChange={(e) => setForm({ ...form, basic: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>House Rent</Label><Input type="number" min={0} value={form.house_rent} onChange={(e) => setForm({ ...form, house_rent: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Medical</Label><Input type="number" min={0} value={form.medical} onChange={(e) => setForm({ ...form, medical: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Transport</Label><Input type="number" min={0} value={form.transport} onChange={(e) => setForm({ ...form, transport: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>PF %</Label><Input type="number" min={0} max={100} value={form.pf_percentage} onChange={(e) => setForm({ ...form, pf_percentage: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>TDS %</Label><Input type="number" min={0} max={100} value={form.tds_percentage} onChange={(e) => setForm({ ...form, tds_percentage: Number(e.target.value) })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
              Make this the default (pre-selected when adding new staff)
            </label>
          </div>
          <DialogFooter>
            <Button disabled={!form.name || form.basic <= 0 || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Salary Structure"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
