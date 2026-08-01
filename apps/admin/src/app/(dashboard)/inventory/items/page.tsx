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

interface ItemCategory {
  id: string;
  name: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
}

interface ItemRow {
  id: string;
  item_code: string;
  category_id: string;
  name: string;
  name_bn: string | null;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  reorder_qty: number;
  expense_account_id: string | null;
  is_active: boolean;
  category: { name: string };
}

const EMPTY_FORM = { category_id: "", name: "", name_bn: "", unit: "", minimum_stock: "0", reorder_qty: "0", expense_account_id: "" };

export default function ItemsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: items, isLoading, isError, error, refetch } = useQuery<ItemRow[]>({
    queryKey: ["inventory", "items", "catalog"],
    queryFn: async () => (await api.get("/api/inventory/items", { params: { limit: 100 } })).data.data,
  });
  const { data: categories } = useQuery<ItemCategory[]>({
    queryKey: ["inventory", "item-categories"],
    queryFn: async () => (await api.get("/api/inventory/item-categories")).data.data,
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
  function openEdit(i: ItemRow) {
    setEditingId(i.id);
    setForm({
      category_id: i.category_id,
      name: i.name,
      name_bn: i.name_bn ?? "",
      unit: i.unit,
      minimum_stock: String(i.minimum_stock),
      reorder_qty: String(i.reorder_qty),
      expense_account_id: i.expense_account_id ?? "",
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        category_id: form.category_id,
        name: form.name,
        name_bn: form.name_bn || undefined,
        unit: form.unit,
        minimum_stock: Number(form.minimum_stock),
        reorder_qty: Number(form.reorder_qty),
        expense_account_id: form.expense_account_id || null,
      };
      return editingId ? api.put(`/api/inventory/items/${editingId}`, payload) : api.post("/api/inventory/items", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Item updated" : "Item created");
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? (editingId ? "Failed to update item" : "Failed to create item")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/inventory/items/${id}`),
    onSuccess: () => {
      toast.success("Item deactivated");
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to delete item"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Items"
        subtitle="Consumable-stock catalog — the items a GRN can actually receive against"
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Items" }]}
        action={
          <div className="flex gap-2">
            <Link href="/inventory/item-categories"><Button variant="outline" size="sm">Item Categories</Button></Link>
            <Button size="sm" onClick={openCreate} disabled={!categories?.length}>+ Add Item</Button>
          </div>
        }
      />

      {!categories?.length && <EmptyState title="No item categories yet" description="Create an item category first, then add items under it." />}

      {!!categories?.length && (
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : isError ? (
              <ErrorState title="Failed to load items" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
            ) : !items?.length ? (
              <EmptyState title="No items yet" description="Add a consumable item — once it exists, it can be selected on a purchase order and received via GRN." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Min Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono">{i.item_code}</TableCell>
                      <TableCell>{i.name}</TableCell>
                      <TableCell>{i.category.name}</TableCell>
                      <TableCell>{i.unit}</TableCell>
                      <TableCell>{i.current_stock}</TableCell>
                      <TableCell>{i.minimum_stock}</TableCell>
                      <TableCell>
                        {i.current_stock <= i.minimum_stock ? <Badge className="bg-orange-100 text-orange-800">Low Stock</Badge> : <Badge className="bg-green-100 text-green-800">Normal</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(i)}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteTarget({ id: i.id, name: i.name })}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. A4 Paper" /></div>
              <div className="space-y-1.5"><Label>Name (Bangla, optional)</Label><Input value={form.name_bn} onChange={(e) => setForm((f) => ({ ...f, name_bn: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="Pcs / Ream / Box" /></div>
              <div className="space-y-1.5"><Label>Minimum Stock</Label><Input type="number" value={form.minimum_stock} onChange={(e) => setForm((f) => ({ ...f, minimum_stock: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Reorder Qty</Label><Input type="number" value={form.reorder_qty} onChange={(e) => setForm((f) => ({ ...f, reorder_qty: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Expense Account (optional)</Label>
              <Select value={form.expense_account_id || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, expense_account_id: v === "NONE" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">—</SelectItem>
                  {expenseAccounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Which expense account a GRN debits when this item is received.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.category_id || !form.name || !form.unit}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete item"
        description={deleteTarget ? `Deactivate item "${deleteTarget.name}"? This is only possible if it has no stock transaction history.` : undefined}
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
