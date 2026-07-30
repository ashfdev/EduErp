"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Label, PageHeader, PageWrapper, SearchInput, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage, ErrorState, LoadingSpinner } from "@education-erp/ui";
import { api } from "@/lib/api";

const ROLES = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
];

// ADMIN and SUPER_ADMIN can never be unchecked here — the checkboxes are
// disabled and forced-on client-side, and the API rejects any submission
// missing either one regardless (the real, structural guarantee; this is
// just the UI reflecting it rather than relying on it).
const ALWAYS_GRANTED = ["SUPER_ADMIN", "ADMIN"];

interface UserRow {
  id: string;
  name_en: string;
  phone: string;
  role: string;
  is_active: boolean;
  staff?: { staff_uid: string } | null;
}

interface PermissionRow {
  id: string;
  key: string;
  label: string;
  category: string | null;
  roles: string[];
}

export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading: usersLoading, isError: usersError, error: usersErrorObj, refetch: refetchUsers } = useQuery<UserRow[]>({
    queryKey: ["settings", "users"],
    queryFn: async () => (await api.get("/api/settings/users")).data.data,
  });
  const { data: permissions, isLoading: permissionsLoading, isError: permissionsError, error: permissionsErrorObj, refetch: refetchPermissions } = useQuery<PermissionRow[]>({
    queryKey: ["settings", "permissions"],
    queryFn: async () => (await api.get("/api/settings/permissions")).data.data,
  });

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filteredUsers = (users ?? []).filter((u) => {
    const q = userSearch.trim().toLowerCase();
    const matchesSearch = !q || u.name_en.toLowerCase().includes(q) || u.phone.includes(q) || u.staff?.staff_uid?.toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

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
      const message = extractErrorMessage(err) ?? "Failed to update role";
      toast.error(message);
    },
  });

  const [editingPermission, setEditingPermission] = useState<PermissionRow | null>(null);
  const [editRoles, setEditRoles] = useState<Set<string>>(new Set());

  function openEditPermission(p: PermissionRow) {
    setEditingPermission(p);
    setEditRoles(new Set(p.roles));
  }

  function toggleRole(role: string) {
    if (ALWAYS_GRANTED.includes(role)) return;
    setEditRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  const updatePermissionMutation = useMutation({
    mutationFn: () => api.put(`/api/settings/permissions/${editingPermission!.key}`, { roles: [...editRoles] }),
    onSuccess: () => {
      toast.success(`Updated who can access "${editingPermission?.label}"`);
      queryClient.invalidateQueries({ queryKey: ["settings", "permissions"] });
      setEditingPermission(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to update permission";
      toast.error(message);
    },
  });

  const permissionsByCategory = new Map<string, PermissionRow[]>();
  for (const p of permissions ?? []) {
    const cat = p.category ?? "Other";
    permissionsByCategory.set(cat, [...(permissionsByCategory.get(cat) ?? []), p]);
  }

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
        <CardContent className="space-y-3 pt-2">
          {usersLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : usersError ? (
            <ErrorState title="Failed to load users" description={extractErrorMessage(usersErrorObj)} retryLabel="Retry" onRetry={() => refetchUsers()} />
          ) : (
            <>
          {!users?.length && <EmptyState title="No users yet" />}
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
                <TableHead>Current Role</TableHead>
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
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>Change Role</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What Each Role Can Access</CardTitle></CardHeader>
        <CardContent className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            SUPER_ADMIN and ADMIN always have full access to every feature below, in addition to the roles listed — that can never be changed here.
            Click a feature to change which other roles can access it; the change applies immediately, no restart needed.
          </p>
          {permissionsLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : permissionsError ? (
            <ErrorState title="Failed to load permissions" description={extractErrorMessage(permissionsErrorObj)} retryLabel="Retry" onRetry={() => refetchPermissions()} />
          ) : (
            <>
          {!permissions?.length && <EmptyState title="No permissions found" />}
          {[...permissionsByCategory.entries()].map(([category, rows]) => (
            <div key={category}>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{category}</p>
              <div className="rounded-md border">
                <Table>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id} className="align-top">
                        <TableCell className="w-56 font-medium">{p.label}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {p.roles.filter((r) => !ALWAYS_GRANTED.includes(r)).map((r) => (
                              <Badge key={r} variant="secondary">{r.replace(/_/g, " ")}</Badge>
                            ))}
                            {p.roles.filter((r) => !ALWAYS_GRANTED.includes(r)).length === 0 && (
                              <span className="text-xs text-muted-foreground">SUPER_ADMIN / ADMIN only</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-28 text-right">
                          <Button size="sm" variant="outline" onClick={() => openEditPermission(p)}>Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
            </>
          )}
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

      <Dialog open={!!editingPermission} onOpenChange={(v) => !v && setEditingPermission(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Who can access &quot;{editingPermission?.label}&quot;?</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <label key={r} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${ALWAYS_GRANTED.includes(r) ? "opacity-60" : ""}`}>
                <Checkbox checked={ALWAYS_GRANTED.includes(r) || editRoles.has(r)} disabled={ALWAYS_GRANTED.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {r.replace(/_/g, " ")}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => updatePermissionMutation.mutate()} disabled={updatePermissionMutation.isPending}>
              {updatePermissionMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
