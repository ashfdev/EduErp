"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Account {
  id: string;
  code: string;
  name: string;
  name_bn: string | null;
  account_nature: string;
  is_system: boolean;
  is_active: boolean;
  balance: number;
}

interface AccountGroup {
  id: string;
  name: string;
  accounts: Account[];
}

function fmt(n: number) {
  return `৳${Math.abs(n).toLocaleString("en-BD", { maximumFractionDigits: 2 })} ${n >= 0 ? "DR" : "CR"}`;
}

const emptyForm = { account_group_id: "", code: "", name: "", account_nature: "DEBIT_NORMAL" };

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: groups } = useQuery<AccountGroup[]>({
    queryKey: ["accounts", "chart"],
    queryFn: async () => (await api.get("/api/accounts/chart")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/accounts", form),
    onSuccess: () => {
      toast.success("Account created");
      queryClient.invalidateQueries({ queryKey: ["accounts", "chart"] });
      setShowNew(false);
      setForm(emptyForm);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create account"),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/api/accounts/${editTarget!.id}`, form),
    onSuccess: () => {
      toast.success("Account updated");
      queryClient.invalidateQueries({ queryKey: ["accounts", "chart"] });
      setEditTarget(null);
      setForm(emptyForm);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update account"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => {
      toast.success("Account deactivated");
      queryClient.invalidateQueries({ queryKey: ["accounts", "chart"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to deactivate account"),
  });

  function openEdit(account: Account, groupId: string) {
    setEditTarget(account);
    setForm({ account_group_id: groupId, code: account.code, name: account.name, account_nature: account.account_nature });
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Chart of Accounts"
        breadcrumbs={[{ label: "Accounts" }, { label: "Chart of Accounts" }]}
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const res = await api.get("/api/accounts/chart/export", { responseType: "blob" });
                const url = URL.createObjectURL(res.data);
                const a = document.createElement("a");
                a.href = url;
                a.download = "Chart_of_Accounts.xlsx";
                a.click();
              }}
            >
              Export
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)}>+ Add Account</Button>
          </div>
        }
      />

      <div className="space-y-4">
        {groups?.map((group) => (
          <Card key={group.id}>
            <CardContent className="pt-6">
              <p className="mb-3 font-semibold">{group.name.toUpperCase()}</p>
              <div className="divide-y">
                {group.accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-muted-foreground">{account.code}</span>
                      <span className={!account.is_active ? "text-muted-foreground line-through" : undefined}>{account.name}</span>
                      <Badge variant="outline">{account.account_nature === "DEBIT_NORMAL" ? "DR" : "CR"}</Badge>
                      {account.is_system && <Badge variant="secondary">System</Badge>}
                      {!account.is_active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{fmt(account.balance)}</span>
                      <Button size="sm" variant="outline" onClick={() => openEdit(account, group.id)}>Edit</Button>
                      {!account.is_system && account.is_active && (
                        <Button size="sm" variant="destructive" onClick={() => setDeactivateTarget(account)}>Deactivate</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={form.account_group_id} onValueChange={(v) => setForm((f) => ({ ...f, account_group_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a group" /></SelectTrigger>
                <SelectContent>
                  {groups?.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. 1108" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sports Equipment" />
            </div>
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select value={form.account_nature} onValueChange={(v) => setForm((f) => ({ ...f, account_nature: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT_NORMAL">Debit Normal</SelectItem>
                  <SelectItem value="CREDIT_NORMAL">Credit Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate()} disabled={!form.account_group_id || !form.code || !form.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Account — {editTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={form.account_group_id} onValueChange={(v) => setForm((f) => ({ ...f, account_group_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a group" /></SelectTrigger>
                <SelectContent>
                  {groups?.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={form.code} disabled={editTarget?.is_system} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              {editTarget?.is_system && <p className="text-xs text-muted-foreground">System account codes cannot be changed.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nature</Label>
              <Select value={form.account_nature} disabled={editTarget?.is_system} onValueChange={(v) => setForm((f) => ({ ...f, account_nature: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT_NORMAL">Debit Normal</SelectItem>
                  <SelectItem value="CREDIT_NORMAL">Credit Normal</SelectItem>
                </SelectContent>
              </Select>
              {editTarget?.is_system && <p className="text-xs text-muted-foreground">System account nature cannot be changed.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => updateMutation.mutate()} disabled={!form.account_group_id || !form.code || !form.name || updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title="Deactivate account"
        description={deactivateTarget ? `Deactivate account "${deactivateTarget.code} - ${deactivateTarget.name}"? It will be hidden from active-account pickers but its history is kept.` : undefined}
        destructive
        confirmLabel="Deactivate"
        loading={deactivateMutation.isPending}
        onConfirm={() => {
          if (deactivateTarget) deactivateMutation.mutate(deactivateTarget.id);
          setDeactivateTarget(null);
        }}
      />
    </PageWrapper>
  );
}
