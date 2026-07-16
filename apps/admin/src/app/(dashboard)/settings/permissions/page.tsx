"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  StatusBadge,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { PERMISSION_CATALOG } from "@/lib/permission-catalog";

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

export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery<UserRow[]>({
    queryKey: ["settings", "users"],
    queryFn: async () => (await api.get("/api/settings/users")).data.data,
  });

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState("");

  function openEdit(u: UserRow) {
    setEditingUser(u);
    setNewRole(u.role);
  }

  const changeRoleMutation = useMutation({
    mutationFn: () => api.put(`/api/settings/users/${editingUser!.id}`, { role: newRole }),
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "users"] });
      setEditingUser(null);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to update role";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Assign roles to staff accounts, and see what each role can access"
        breadcrumbs={[{ label: "Settings" }, { label: "Roles & Permissions" }]}
        action={<Link href="/settings/users"><Button variant="outline">Manage Users</Button></Link>}
      />

      <Card>
        <CardHeader><CardTitle>Assign Roles</CardTitle></CardHeader>
        <CardContent className="pt-2">
          {!users?.length && <EmptyState title="No users yet" />}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Name</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Current Role</th>
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
                  <td className="p-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>Change Role</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What Each Role Can Access</CardTitle></CardHeader>
        <CardContent className="pt-2">
          <p className="mb-3 text-sm text-muted-foreground">
            Reference only — roles have a fixed set of permissions built into the system; this table can&apos;t be edited here.
            SUPER_ADMIN and ADMIN always have full access to every feature below, in addition to the roles listed.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Feature</th>
                  <th className="p-2">Roles with access</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_CATALOG.map((entry) => (
                  <tr key={entry.feature} className="border-b align-top">
                    <td className="p-2 font-medium">{entry.feature}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.roles.filter((r) => r !== "SUPER_ADMIN" && r !== "ADMIN").map((r) => (
                          <Badge key={r} variant="secondary">{r.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(v) => !v && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Role — {editingUser?.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button onClick={() => changeRoleMutation.mutate()} disabled={changeRoleMutation.isPending || newRole === editingUser?.role}>
              {changeRoleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
