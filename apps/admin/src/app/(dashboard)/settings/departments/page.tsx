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
  Table,
  TableBody,
  TableRow,
  TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
  code: string;
  head_id?: string | null;
  head?: { id: string; name_en: string } | null;
}
interface StaffOption {
  id: string;
  name_en: string;
}

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { data: departments } = useQuery<Department[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });
  const { data: staff } = useQuery<StaffOption[]>({
    queryKey: ["hr", "staff", "list"],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { limit: 100 } })).data.data,
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name_en: "", code: "" });

  function openCreate() {
    setEditingId(null);
    setForm({ name_en: "", code: "" });
    setOpen(true);
  }
  function openEdit(d: Department) {
    setEditingId(d.id);
    setForm({ name_en: d.name_en, code: d.code });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? api.put(`/api/settings/departments/${editingId}`, form) : api.post("/api/settings/departments", form)),
    onSuccess: () => {
      toast.success(editingId ? "Department updated" : "Department created");
      queryClient.invalidateQueries({ queryKey: ["settings", "departments"] });
      setOpen(false);
      setForm({ name_en: "", code: "" });
    },
    onError: () => toast.error(editingId ? "Failed to update department" : "Failed to create department"),
  });

  const setHeadMutation = useMutation({
    mutationFn: ({ id, head_id }: { id: string; head_id: string | null }) => api.put(`/api/settings/departments/${id}/head`, { head_id }),
    onSuccess: () => {
      toast.success("Department head updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "departments"] });
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
        action={<Button onClick={openCreate}>+ Add Department</Button>}
      />

      {!departments?.length && <EmptyState title="No departments yet" />}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableBody>
              {departments?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name_en}</TableCell>
                  <TableCell className="text-muted-foreground">{d.code}</TableCell>
                  <TableCell>
                    <select
                      className="rounded-md border px-2 py-1 text-sm"
                      value={d.head_id ?? ""}
                      onChange={(e) => setHeadMutation.mutate({ id: d.id, head_id: e.target.value || null })}
                    >
                      <option value="">No head assigned</option>
                      {staff?.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
                    </select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openEdit(d)}>Edit</Button>{" "}
                    <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(d.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Department" : "Add Department"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name_en || !form.code}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
