"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, SearchInput, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
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
  const [form, setForm] = useState({ name_en: "", phone: "", email: "", role: "SUBJECT_TEACHER", designation: "", login_password: "" });
  const [credentialModal, setCredentialModal] = useState<{ name: string; phone: string; password: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filteredUsers = (users ?? []).filter((u) => {
    const q = userSearch.trim().toLowerCase();
    const matchesSearch = !q || u.name_en.toLowerCase().includes(q) || u.phone.includes(q) || u.staff?.staff_uid?.toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/settings/users", { ...form, login_password: form.login_password || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "users"] });
      setOpen(false);
      setCredentialModal({ name: form.name_en, phone: form.phone, password: res.data.data.temp_password });
      setForm({ name_en: "", phone: "", email: "", role: "SUBJECT_TEACHER", designation: "", login_password: "" });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err);
      toast.error(message ?? "Failed to create user");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/settings/users/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "users"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/settings/users/${resetTarget!.id}/reset-password`, {
        login_password: resetPasswordValue || undefined,
      }),
    onSuccess: (res) => {
      setCredentialModal({ name: resetTarget!.name_en, phone: resetTarget!.phone, password: res.data.data.temp_password });
      closeResetDialog();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err);
      toast.error(message ?? "Failed to reset password");
    },
  });

  function closeResetDialog() {
    setResetTarget(null);
    setResetPasswordValue("");
  }

  function copyPassword() {
    if (!credentialModal) return;
    navigator.clipboard.writeText(credentialModal.password).then(
      () => toast.success("Password copied"),
      () => toast.error("Couldn't copy — select and copy manually"),
    );
  }

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
        <CardContent className="space-y-3 pt-6">
          {!!users?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput placeholder="Search by name, phone, or staff ID..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="max-w-xs" />
              <select className="rounded-md border px-3 py-2 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
              {(userSearch || roleFilter) && (
                <span className="text-xs text-muted-foreground">{filteredUsers.length} of {users.length}</span>
              )}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!!users?.length && !filteredUsers.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No users match this search/filter.</TableCell></TableRow>
              )}
              {filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name_en} {u.staff?.staff_uid && <span className="ml-1 font-mono text-xs text-muted-foreground">{u.staff.staff_uid}</span>}</TableCell>
                  <TableCell>{u.phone}</TableCell>
                  <TableCell><Badge variant="outline">{u.role.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><StatusBadge status={u.is_active ? "ACTIVE" : "INACTIVE"} /></TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setResetTarget(u)}>Reset Password</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(u.id)}>{u.is_active ? "Disable" : "Enable"}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
            <div className="space-y-1.5">
              <Label>Initial Password (optional)</Label>
              <Input
                type="text"
                value={form.login_password}
                onChange={(e) => setForm({ ...form, login_password: e.target.value })}
                placeholder="Leave blank to auto-generate a memorable password"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">If set, min 8 characters with an uppercase letter, a lowercase letter, and a number. The user must still change it on first login.</p>
            </div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name_en || !form.phone}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(v) => !v && closeResetDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password — {resetTarget?.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>New Password (optional)</Label>
              <Input
                type="text"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="Leave blank to auto-generate a memorable password"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">If set, min 8 characters with an uppercase letter, a lowercase letter, and a number. The user must still change it on first login.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => resetPasswordMutation.mutate()} disabled={resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credentialModal} onOpenChange={(v) => !v && setCredentialModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Login Credentials — {credentialModal?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-amber-700">Save this now — it will not be shown again. It was also sent via SMS to {credentialModal?.phone}.</p>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input readOnly value={credentialModal?.phone ?? ""} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <div className="flex gap-2">
                <Input readOnly value={credentialModal?.password ?? ""} className="font-mono" />
                <Button type="button" variant="outline" onClick={copyPassword}>Copy</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The user will be required to set their own password on first login.</p>
          </div>
          <DialogFooter><Button onClick={() => setCredentialModal(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
