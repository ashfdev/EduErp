"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Badge, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Account {
  id: string;
  code: string;
  name: string;
  name_bn: string | null;
  account_nature: string;
  is_system: boolean;
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

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ account_group_id: "", code: "", name: "", account_nature: "DEBIT_NORMAL" });

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
      setForm({ account_group_id: "", code: "", name: "", account_nature: "DEBIT_NORMAL" });
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to create account"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Chart of Accounts"
        breadcrumbs={[{ label: "Accounts" }, { label: "Chart of Accounts" }]}
        action={<Button size="sm" onClick={() => setShowNew(true)}>+ Add Account</Button>}
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
                      <span>{account.name}</span>
                      <Badge variant="outline">{account.account_nature === "DEBIT_NORMAL" ? "DR" : "CR"}</Badge>
                      {account.is_system && <Badge variant="secondary">System</Badge>}
                    </div>
                    <span className="font-medium">{fmt(account.balance)}</span>
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
    </PageWrapper>
  );
}
