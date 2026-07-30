"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, extractErrorMessage, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner } from "@education-erp/ui";
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

  const { data, isLoading, isError, error, refetch } = useQuery<{ items: Item[] }>({ queryKey: ["inventory", "items"], queryFn: async () => ({ items: (await api.get("/api/inventory/items", { params: { limit: 100 } })).data.data }) });

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
      <PageHeader
        title="Stock & Items"
        breadcrumbs={[{ label: "Inventory" }, { label: "Stock" }]}
        action={
          <div className="flex gap-2">
            <Link href="/inventory/items"><Button variant="outline" size="sm">Manage Items</Button></Link>
            <Button size="sm" onClick={() => setShowIssue(true)}>Issue Stock</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load items" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !data?.items.length ? (
            <EmptyState
              title="No items yet"
              description="Add an item category, then add items under it, to start tracking consumable stock."
              action={<Link href="/inventory/item-categories"><Button size="sm">Item Categories</Button></Link>}
            />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((i) => {
                  const status = stockStatus(i);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono">{i.item_code}</TableCell>
                      <TableCell>{i.name}</TableCell>
                      <TableCell>{i.category.name}</TableCell>
                      <TableCell>{i.unit}</TableCell>
                      <TableCell>{i.current_stock}</TableCell>
                      <TableCell>{i.minimum_stock}</TableCell>
                      <TableCell><Badge className={status.color}>{status.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
