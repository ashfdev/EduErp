"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Badge, Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, ErrorState, LoadingSpinner, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, extractErrorMessage,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Account {
  id: string;
  code: string;
  name: string;
}

interface AssetCategoryRow {
  id: string;
  name: string;
  name_bn: string | null;
  depreciation_method: string;
  depreciation_rate: number;
  useful_life_years: number;
  asset_account_id: string | null;
  accumulated_dep_account_id: string | null;
  dep_expense_account_id: string | null;
  _count: { assets: number };
}

const EMPTY_FORM = {
  name: "",
  name_bn: "",
  depreciation_method: "STRAIGHT_LINE",
  depreciation_rate: "10",
  useful_life_years: "10",
  asset_account_id: "",
  accumulated_dep_account_id: "",
  dep_expense_account_id: "",
};

export default function AssetCategoriesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: categories, isLoading, isError, error, refetch } = useQuery<AssetCategoryRow[]>({
    queryKey: ["inventory", "asset-categories", "manage"],
    queryFn: async () => (await api.get("/api/inventory/asset-categories")).data.data,
  });
  const { data: assetAccounts } = useQuery<Account[]>({
    queryKey: ["accounts", "search", "ASSET"],
    queryFn: async () => (await api.get("/api/accounts/search", { params: { type: "ASSET" } })).data.data,
  });
  const { data: expenseAccounts } = useQuery<Account[]>({
    queryKey: ["accounts", "search", "EXPENSE"],
    queryFn: async () => (await api.get("/api/accounts/search", { params: { type: "EXPENSE" } })).data.data,
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }
  function openEdit(c: AssetCategoryRow) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      name_bn: c.name_bn ?? "",
      depreciation_method: c.depreciation_method,
      depreciation_rate: String(c.depreciation_rate),
      useful_life_years: String(c.useful_life_years),
      asset_account_id: c.asset_account_id ?? "",
      accumulated_dep_account_id: c.accumulated_dep_account_id ?? "",
      dep_expense_account_id: c.dep_expense_account_id ?? "",
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        name_bn: form.name_bn || undefined,
        depreciation_method: form.depreciation_method,
        depreciation_rate: Number(form.depreciation_rate),
        useful_life_years: Number(form.useful_life_years),
        asset_account_id: form.asset_account_id || null,
        accumulated_dep_account_id: form.accumulated_dep_account_id || null,
        dep_expense_account_id: form.dep_expense_account_id || null,
      };
      return editingId ? api.put(`/api/inventory/asset-categories/${editingId}`, payload) : api.post("/api/inventory/asset-categories", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Asset category updated" : "Asset category created");
      queryClient.invalidateQueries({ queryKey: ["inventory", "asset-categories"] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? (editingId ? "Failed to update category" : "Failed to create category")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/inventory/asset-categories/${id}`),
    onSuccess: () => {
      toast.success("Asset category deleted");
      queryClient.invalidateQueries({ queryKey: ["inventory", "asset-categories"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to delete category"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Asset Categories"
        subtitle="Depreciation rate, useful life, and linked accounts for each class of fixed asset"
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Asset Categories" }]}
        action={
          <div className="flex gap-2">
            <Link href="/inventory/assets"><Button variant="outline" size="sm">Fixed Assets</Button></Link>
            <Button size="sm" onClick={openCreate}>+ Add Category</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load asset categories" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !categories?.length ? (
            <EmptyState title="No asset categories yet" description="Create a category (e.g. Furniture, Electronics) to start adding fixed assets." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Useful Life</TableHead>
                  <TableHead>Assets</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><Badge variant="outline">{c.depreciation_method.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{c.depreciation_rate}%/yr</TableCell>
                    <TableCell>{c.useful_life_years} yrs</TableCell>
                    <TableCell>{c._count.assets}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Asset Category" : "Add Asset Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Furniture" /></div>
              <div className="space-y-1.5"><Label>Name (Bangla, optional)</Label><Input value={form.name_bn} onChange={(e) => setForm((f) => ({ ...f, name_bn: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Depreciation Method</Label>
                <Select value={form.depreciation_method} onValueChange={(v) => setForm((f) => ({ ...f, depreciation_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STRAIGHT_LINE">Straight Line</SelectItem>
                    <SelectItem value="WRITTEN_DOWN_VALUE">Written Down Value</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Depreciation Rate (%/yr)</Label><Input type="number" value={form.depreciation_rate} onChange={(e) => setForm((f) => ({ ...f, depreciation_rate: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Useful Life (years)</Label><Input type="number" value={form.useful_life_years} onChange={(e) => setForm((f) => ({ ...f, useful_life_years: e.target.value }))} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>Asset Account (optional)</Label>
              <Select value={form.asset_account_id || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, asset_account_id: v === "NONE" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">—</SelectItem>
                  {assetAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Debited on purchase/GRN; required before an asset in this category can be disposed.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Accumulated Depreciation Account (optional)</Label>
                <Select value={form.accumulated_dep_account_id || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, accumulated_dep_account_id: v === "NONE" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {assetAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Depreciation Expense Account (optional)</Label>
                <Select value={form.dep_expense_account_id || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, dep_expense_account_id: v === "NONE" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {expenseAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.depreciation_rate || !form.useful_life_years}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete asset category"
        description={deleteTarget ? `Delete category "${deleteTarget.name}"? This is only possible if no assets belong to it.` : undefined}
        destructive
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </PageWrapper>
  );
}
