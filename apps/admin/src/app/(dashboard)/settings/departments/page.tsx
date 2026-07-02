"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
  code: string;
  head?: { name_en: string } | null;
}

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { data: departments } = useQuery<Department[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_en: "", code: "" });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/settings/departments", form),
    onSuccess: () => {
      toast.success("Department created");
      queryClient.invalidateQueries({ queryKey: ["settings", "departments"] });
      setOpen(false);
      setForm({ name_en: "", code: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/departments/${id}`),
    onSuccess: () => {
      toast.success("Department removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "departments"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Departments"
        subtitle="Academic departments (used by university/college institution types)"
        breadcrumbs={[{ label: "Settings" }, { label: "Departments" }]}
        action={<Button onClick={() => setOpen(true)}>+ Add Department</Button>}
      />

      {!departments?.length && <EmptyState title="No departments yet" />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <tbody>
              {departments?.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className="p-2 font-medium">{d.name_en}</td>
                  <td className="p-2 text-muted-foreground">{d.code}</td>
                  <td className="p-2 text-muted-foreground">{d.head?.name_en ?? "No head assigned"}</td>
                  <td className="p-2"><Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(d.id)}>Delete</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Department</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
