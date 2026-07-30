"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Input, Label, PageHeader, PageWrapper, extractErrorMessage,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ItemCategoryRow {
  id: string;
  name: string;
  name_bn: string | null;
  _count: { items: number };
}

export default function ItemCategoriesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: categories } = useQuery<ItemCategoryRow[]>({
    queryKey: ["inventory", "item-categories"],
    queryFn: async () => (await api.get("/api/inventory/item-categories")).data.data,
  });

  function resetForm() {
    setName("");
    setNameBn("");
  }
  function openCreate() {
    setEditingId(null);
    resetForm();
    setOpen(true);
  }
  function openEdit(c: ItemCategoryRow) {
    setEditingId(c.id);
    setName(c.name);
    setNameBn(c.name_bn ?? "");
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name, name_bn: nameBn || undefined };
      return editingId ? api.put(`/api/inventory/item-categories/${editingId}`, payload) : api.post("/api/inventory/item-categories", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Item category updated" : "Item category created");
      queryClient.invalidateQueries({ queryKey: ["inventory", "item-categories"] });
      setOpen(false);
      resetForm();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? (editingId ? "Failed to update category" : "Failed to create category")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/inventory/item-categories/${id}`),
    onSuccess: () => {
      toast.success("Item category deleted");
      queryClient.invalidateQueries({ queryKey: ["inventory", "item-categories"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to delete category"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Item Categories"
        subtitle="Catalog groupings for consumable stock items (e.g. Stationery, Cleaning Supplies, Lab Consumables)"
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Item Categories" }]}
        action={
          <div className="flex gap-2">
            <Link href="/inventory/items"><Button variant="outline" size="sm">Manage Items</Button></Link>
            <Button size="sm" onClick={openCreate}>+ Add Category</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {!categories?.length ? (
            <EmptyState title="No item categories yet" description="Create a category first, then add items under it." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Name (Bangla)</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.name_bn ?? "—"}</TableCell>
                    <TableCell>{c._count.items}</TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? "Edit Item Category" : "Add Item Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stationery" /></div>
            <div className="space-y-1.5"><Label>Name (Bangla, optional)</Label><Input value={nameBn} onChange={(e) => setNameBn(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete item category"
        description={deleteTarget ? `Delete category "${deleteTarget.name}"? This is only possible if no items belong to it.` : undefined}
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
