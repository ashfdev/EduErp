"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, extractErrorMessage, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Requisition {
  id: string;
  req_no: string;
  reason: string;
  status: string;
  created_at: string;
  items: { description: string; quantity: number }[];
}

interface PurchaseOrder {
  id: string;
  po_no: string;
  supplier_id: string;
  order_date: string;
  total_amount: number;
  status: string;
  supplier: { name: string };
  items: { id: string; description: string; quantity: number; received_qty: number; unit_price: number; purchase_type: string }[];
}

interface Supplier {
  id: string;
  name: string;
}

interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  category: { name: string };
}

interface AssetCategoryOption {
  id: string;
  name: string;
}

function RequisitionsTab() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [reason, setReason] = useState("");
  const [items, setItems] = useState([{ description: "", quantity: "1" }]);

  const { data, isLoading, isError, error, refetch } = useQuery<Requisition[]>({ queryKey: ["inventory", "requisitions"], queryFn: async () => (await api.get("/api/inventory/requisitions")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/inventory/requisitions", { reason, items: items.filter((i) => i.description).map((i) => ({ description: i.description, quantity: Number(i.quantity) })) }),
    onSuccess: () => {
      toast.success("Requisition submitted");
      queryClient.invalidateQueries({ queryKey: ["inventory", "requisitions"] });
      setShowNew(false);
      setReason("");
      setItems([{ description: "", quantity: "1" }]);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to submit requisition"),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/inventory/requisitions/${id}/approve`),
    onSuccess: () => {
      toast.success("Requisition approved");
      queryClient.invalidateQueries({ queryKey: ["inventory", "requisitions"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to approve requisition"),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-end"><Button size="sm" onClick={() => setShowNew(true)}>New Requisition</Button></div>
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : isError ? (
          <ErrorState title="Failed to load requisitions" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
        ) : !data?.length ? <EmptyState title="No requisitions yet" /> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>REQ No</TableHead><TableHead>Reason</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.req_no}</TableCell>
                  <TableCell>{r.reason}</TableCell>
                  <TableCell>{r.items.length}</TableCell>
                  <TableCell><Badge>{r.status}</Badge></TableCell>
                  <TableCell>{r.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(r.id)}>Approve</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Requisition</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Description" value={item.description} onChange={(e) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, description: e.target.value } : it)))} />
                  <Input type="number" className="w-20" value={item.quantity} onChange={(e) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, quantity: e.target.value } : it)))} />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { description: "", quantity: "1" }])}>+ Add Item</Button>
            </div>
            <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={!reason}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function PurchaseOrdersTab() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [showGrn, setShowGrn] = useState<PurchaseOrder | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [poItems, setPoItems] = useState([{ description: "", quantity: "1", unit_price: "0", purchase_type: "CONSUMABLE", item_id: "", asset_category_id: "" }]);
  const [grnQuantities, setGrnQuantities] = useState<Record<string, string>>({});

  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["inventory", "suppliers"], queryFn: async () => (await api.get("/api/inventory/suppliers")).data.data });
  const { data: orders, isLoading: ordersLoading, isError: ordersError, error: ordersErrorObj, refetch: refetchOrders } = useQuery<PurchaseOrder[]>({ queryKey: ["inventory", "purchase-orders"], queryFn: async () => (await api.get("/api/inventory/purchase-orders")).data.data });
  // Sourced from the Item/Asset-Category catalogs so a PO line item can
  // actually be traced through to a specific Item/AssetCategory — without
  // this, GRN receiving has no item_id to increment stock against (a
  // CONSUMABLE line only updates stock when poItem.item_id is set).
  const { data: catalogItems } = useQuery<CatalogItem[]>({ queryKey: ["inventory", "items", "picker"], queryFn: async () => (await api.get("/api/inventory/items", { params: { limit: 100 } })).data.data });
  const { data: assetCategories } = useQuery<AssetCategoryOption[]>({ queryKey: ["inventory", "asset-categories", "picker"], queryFn: async () => (await api.get("/api/inventory/asset-categories")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/inventory/purchase-orders", {
        supplier_id: supplierId,
        order_date: new Date().toISOString().slice(0, 10),
        items: poItems
          .filter((i) => i.description)
          .map((i) => ({
            description: i.description,
            purchase_type: i.purchase_type,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
            item_id: i.purchase_type === "CONSUMABLE" && i.item_id ? i.item_id : undefined,
            asset_category_id: i.purchase_type === "ASSET" && i.asset_category_id ? i.asset_category_id : undefined,
          })),
      }),
    onSuccess: () => {
      toast.success("Purchase order created");
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      setShowNew(false);
      setSupplierId("");
      setPoItems([{ description: "", quantity: "1", unit_price: "0", purchase_type: "CONSUMABLE", item_id: "", asset_category_id: "" }]);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to create purchase order"),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/inventory/purchase-orders/${id}/approve`),
    onSuccess: () => {
      toast.success("PO approved");
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to approve purchase order"),
  });

  const grnMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/inventory/purchase-orders/${showGrn!.id}/grn`, {
        received_date: new Date().toISOString().slice(0, 10),
        items: showGrn!.items.filter((i) => Number(grnQuantities[i.id] ?? 0) > 0).map((i) => ({ po_item_id: i.id, received_qty: Number(grnQuantities[i.id]) })),
      }),
    onSuccess: (res) => {
      toast.success(`GRN ${res.data.data.grn.grn_no} recorded — ${res.data.data.created_assets.length} asset(s), ${res.data.data.updated_stock.length} stock item(s) updated`);
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      setShowGrn(null);
      setGrnQuantities({});
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record GRN"),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-end"><Button size="sm" onClick={() => setShowNew(true)}>Create PO</Button></div>
        {ordersLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : ordersError ? (
          <ErrorState title="Failed to load purchase orders" description={extractErrorMessage(ordersErrorObj)} retryLabel="Retry" onRetry={() => refetchOrders()} />
        ) : !orders?.length ? <EmptyState title="No purchase orders yet" /> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>PO No</TableHead><TableHead>Supplier</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>{po.po_no}</TableCell>
                  <TableCell>{po.supplier.name}</TableCell>
                  <TableCell>৳{po.total_amount.toLocaleString()}</TableCell>
                  <TableCell><Badge>{po.status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="space-x-2">
                    {po.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(po.id)}>Approve</Button>}
                    {(po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED") && <Button size="sm" onClick={() => setShowGrn(po)}>Receive (GRN)</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {poItems.map((item, i) => (
                <div key={i} className="space-y-1.5 rounded-md border p-2">
                  <div className="flex gap-2">
                    <Input placeholder="Description" value={item.description} onChange={(e) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, description: e.target.value } : it)))} />
                    <Select value={item.purchase_type} onValueChange={(v) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, purchase_type: v, item_id: "", asset_category_id: "" } : it)))}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="CONSUMABLE">Consumable</SelectItem><SelectItem value="ASSET">Asset</SelectItem></SelectContent>
                    </Select>
                    <Input type="number" className="w-16" placeholder="Qty" value={item.quantity} onChange={(e) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, quantity: e.target.value } : it)))} />
                    <Input type="number" className="w-24" placeholder="Unit price" value={item.unit_price} onChange={(e) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, unit_price: e.target.value } : it)))} />
                  </div>
                  {item.purchase_type === "CONSUMABLE" ? (
                    <Select value={item.item_id || "NONE"} onValueChange={(v) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, item_id: v === "NONE" ? "" : v } : it)))}>
                      <SelectTrigger><SelectValue placeholder="Link to catalog item (required for stock to update on GRN)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">— No catalog link (stock will not update on receipt) —</SelectItem>
                        {catalogItems?.map((ci) => <SelectItem key={ci.id} value={ci.id}>{ci.name} ({ci.category.name}, {ci.unit})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={item.asset_category_id || "NONE"} onValueChange={(v) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, asset_category_id: v === "NONE" ? "" : v } : it)))}>
                      <SelectTrigger><SelectValue placeholder="Asset category (required to create assets on GRN)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">— None —</SelectItem>
                        {assetCategories?.map((ac) => <SelectItem key={ac.id} value={ac.id}>{ac.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setPoItems((prev) => [...prev, { description: "", quantity: "1", unit_price: "0", purchase_type: "CONSUMABLE", item_id: "", asset_category_id: "" }])}>+ Add Item</Button>
            </div>
            <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={!supplierId}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!showGrn} onOpenChange={(open) => !open && setShowGrn(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Receive Goods — {showGrn?.po_no}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {showGrn?.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">{item.description} ({item.received_qty}/{item.quantity} received)</span>
                  <Input type="number" className="w-24" placeholder="Receive qty" value={grnQuantities[item.id] ?? ""} onChange={(e) => setGrnQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                </div>
              ))}
            </div>
            <DialogFooter><Button onClick={() => grnMutation.mutate()}>Confirm Receipt</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ReceivedTab() {
  interface Grn {
    id: string;
    grn_no: string;
    received_date: string;
    total_amount: number;
    po: { po_no: string; supplier: { name: string } };
  }
  const { data, isLoading, isError, error, refetch } = useQuery<Grn[]>({ queryKey: ["inventory", "purchase-history"], queryFn: async () => (await api.get("/api/inventory/reports/purchase-history")).data.data });
  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : isError ? (
          <ErrorState title="Failed to load GRNs" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
        ) : !data?.length ? <EmptyState title="No GRNs yet" /> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>GRN No</TableHead><TableHead>PO No</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.grn_no}</TableCell>
                  <TableCell>{g.po.po_no}</TableCell>
                  <TableCell>{g.po.supplier.name}</TableCell>
                  <TableCell>{new Date(g.received_date).toLocaleDateString()}</TableCell>
                  <TableCell>৳{g.total_amount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function PurchasesPage() {
  return (
    <PageWrapper>
      <PageHeader title="Purchases" breadcrumbs={[{ label: "Inventory" }, { label: "Purchases" }]} />
      <Tabs defaultValue="requisitions">
        <TabsList>
          <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="received">Received (GRNs)</TabsTrigger>
        </TabsList>
        <TabsContent value="requisitions"><RequisitionsTab /></TabsContent>
        <TabsContent value="orders"><PurchaseOrdersTab /></TabsContent>
        <TabsContent value="received"><ReceivedTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
