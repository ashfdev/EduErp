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
  Badge,
  StatusBadge,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from "@education-erp/ui";
import Link from "next/link";
import { api } from "@/lib/api";

const ROLES = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
];

interface UserRow {
  id: string;
  name_en: string;
  phone: string;
  role: string;
  is_active: boolean;
  staff?: { staff_uid: string } | null;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery<UserRow[]>({
    queryKey: ["settings", "users"],
    queryFn: async () => (await api.get("/api/settings/users")).data.data,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name_en: "", phone: "", email: "", role: "SUBJECT_TEACHER", designation: "" });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/settings/users", form),
    onSuccess: () => {
      toast.success("User created — credentials sent via SMS");
      queryClient.invalidateQueries({ queryKey: ["settings", "users"] });
      setOpen(false);
      setForm({ name_en: "", phone: "", email: "", role: "SUBJECT_TEACHER", designation: "" });
    },
    onError: () => toast.error("Failed to create user"),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/settings/users/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "users"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/settings/users/${id}/reset-password`),
    onSuccess: (res) => toast.success(`Password reset. Temp password: ${res.data.data.temp_password}`),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="User Accounts"
        subtitle="Staff accounts and role assignment"
        breadcrumbs={[{ label: "Settings" }, { label: "Users" }]}
        action={
          <div className="flex gap-2">
            <Link href="/settings/permissions"><Button variant="outline">Roles & Permissions</Button></Link>
            <Button onClick={() => setOpen(true)}>+ Add User</Button>
          </div>
        }
      />

      {!users?.length && <EmptyState title="No users yet" />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Name</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Role</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="p-2 font-medium">{u.name_en} {u.staff?.staff_uid && <span className="ml-1 font-mono text-xs text-muted-foreground">{u.staff.staff_uid}</span>}</td>
                  <td className="p-2">{u.phone}</td>
                  <td className="p-2"><Badge variant="outline">{u.role.replace(/_/g, " ")}</Badge></td>
                  <td className="p-2"><StatusBadge status={u.is_active ? "ACTIVE" : "INACTIVE"} /></td>
                  <td className="p-2 space-x-2">
                    <Button size="sm" variant="outline" onClick={() => resetPasswordMutation.mutate(u.id)}>Reset Password</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(u.id)}>{u.is_active ? "Disable" : "Enable"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
            <div className="space-y-1.5"><Label>Email (optional)</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name_en || !form.phone}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
