"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Item {
  id: string;
  item_code: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  category: { name: string };
}

function stockStatus(item: Item): { label: string; color: string } {
  if (item.current_stock === 0) return { label: "Out of Stock", color: "bg-red-100 text-red-800" };
  if (item.current_stock <= item.minimum_stock) return { label: "Low Stock", color: "bg-orange-100 text-orange-800" };
  return { label: "Normal", color: "bg-green-100 text-green-800" };
}

export default function StockPage() {
  const queryClient = useQueryClient();
  const [showIssue, setShowIssue] = useState(false);
  const [issueForm, setIssueForm] = useState({ item_id: "", quantity: "", notes: "" });

  const { data } = useQuery<{ items: Item[] }>({ queryKey: ["inventory", "items"], queryFn: async () => ({ items: (await api.get("/api/inventory/items", { params: { limit: 100 } })).data.data }) });

  const issueMutation = useMutation({
    mutationFn: () => api.post("/api/inventory/stock/issue", { ...issueForm, quantity: Number(issueForm.quantity) }),
    onSuccess: () => {
      toast.success("Stock issued");
      queryClient.invalidateQueries({ queryKey: ["inventory", "items"] });
      setShowIssue(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to issue stock"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Stock & Items" breadcrumbs={[{ label: "Inventory" }, { label: "Stock" }]} action={<Button size="sm" onClick={() => setShowIssue(true)}>Issue Stock</Button>} />

      <Card>
        <CardContent className="pt-6">
          {!data?.items.length ? (
            <EmptyState title="No items yet" description="Add items under a category first, via the API or a future items admin page." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Current Stock</th>
                  <th className="py-2 pr-4">Min Stock</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => {
                  const status = stockStatus(i);
                  return (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{i.item_code}</td>
                      <td className="py-2 pr-4">{i.name}</td>
                      <td className="py-2 pr-4">{i.category.name}</td>
                      <td className="py-2 pr-4">{i.unit}</td>
                      <td className="py-2 pr-4">{i.current_stock}</td>
                      <td className="py-2 pr-4">{i.minimum_stock}</td>
                      <td className="py-2 pr-4"><Badge className={status.color}>{status.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showIssue} onOpenChange={setShowIssue}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue Stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Select value={issueForm.item_id} onValueChange={(v) => setIssueForm((f) => ({ ...f, item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>{data?.items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} available)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" value={issueForm.quantity} onChange={(e) => setIssueForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={issueForm.notes} onChange={(e) => setIssueForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => issueMutation.mutate()} disabled={!issueForm.item_id || !issueForm.quantity}>Issue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
