"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Switch, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface LeaveType {
  id: string;
  name: string;
  days_allowed: number;
  is_paid: boolean;
}

const emptyForm = { name: "", days_allowed: 10, is_paid: true };

export default function LeaveTypesPage() {
  const queryClient = useQueryClient();
  const { data: leaveTypes } = useQuery<LeaveType[]>({
    queryKey: ["hr", "leave-types"],
    queryFn: async () => (await api.get("/api/hr/leave-types")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(lt: LeaveType) {
    setEditingId(lt.id);
    setForm({ name: lt.name, days_allowed: lt.days_allowed, is_paid: lt.is_paid });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? api.put(`/api/hr/leave-types/${editingId}`, form) : api.post("/api/hr/leave-types", form)),
    onSuccess: () => {
      toast.success(editingId ? "Leave type updated" : "Leave type created");
      queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: () => toast.error(editingId ? "Failed to update leave type" : "Failed to create leave type"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/hr/leave-types/${id}`),
    onSuccess: () => {
      toast.success("Leave type removed");
      queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove leave type"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Leave Types"
        subtitle="Casual, sick, earned, etc. — used by staff and teacher leave applications"
        breadcrumbs={[{ label: "Settings" }, { label: "Leave Types" }]}
        action={<Button onClick={openCreate}>+ Add Leave Type</Button>}
      />

      {!leaveTypes?.length && <EmptyState title="No leave types yet" description="Add at least one so staff can apply for leave." />}

      {!!leaveTypes?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Days Allowed</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveTypes.map((lt) => (
                  <TableRow key={lt.id}>
                    <TableCell className="font-medium">{lt.name}</TableCell>
                    <TableCell>{lt.days_allowed}</TableCell>
                    <TableCell>{lt.is_paid ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(lt)}>Edit</Button>{" "}
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(lt.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Leave Type" : "Add Leave Type"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Casual Leave" /></div>
            <div className="space-y-1.5"><Label>Days Allowed (per year)</Label><Input type="number" min={0} value={form.days_allowed} onChange={(e) => setForm({ ...form, days_allowed: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: v })} />
              <Label>Paid leave</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
