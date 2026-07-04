"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Badge, EmptyState, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@education-erp/ui";
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

function RequisitionsTab() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [reason, setReason] = useState("");
  const [items, setItems] = useState([{ description: "", quantity: "1" }]);

  const { data } = useQuery<Requisition[]>({ queryKey: ["inventory", "requisitions"], queryFn: async () => (await api.get("/api/inventory/requisitions")).data.data });

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
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/inventory/requisitions/${id}/approve`),
    onSuccess: () => {
      toast.success("Requisition approved");
      queryClient.invalidateQueries({ queryKey: ["inventory", "requisitions"] });
    },
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-end"><Button size="sm" onClick={() => setShowNew(true)}>New Requisition</Button></div>
        {!data?.length ? <EmptyState title="No requisitions yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">REQ No</th><th className="py-2">Reason</th><th className="py-2">Items</th><th className="py-2">Status</th><th className="py-2"></th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.req_no}</td>
                  <td className="py-2">{r.reason}</td>
                  <td className="py-2">{r.items.length}</td>
                  <td className="py-2"><Badge>{r.status}</Badge></td>
                  <td className="py-2">{r.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(r.id)}>Approve</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [poItems, setPoItems] = useState([{ description: "", quantity: "1", unit_price: "0", purchase_type: "CONSUMABLE" }]);
  const [grnQuantities, setGrnQuantities] = useState<Record<string, string>>({});

  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["inventory", "suppliers"], queryFn: async () => (await api.get("/api/inventory/suppliers")).data.data });
  const { data: orders } = useQuery<PurchaseOrder[]>({ queryKey: ["inventory", "purchase-orders"], queryFn: async () => (await api.get("/api/inventory/purchase-orders")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/inventory/purchase-orders", {
        supplier_id: supplierId,
        order_date: new Date().toISOString().slice(0, 10),
        items: poItems.filter((i) => i.description).map((i) => ({ description: i.description, purchase_type: i.purchase_type, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      }),
    onSuccess: () => {
      toast.success("Purchase order created");
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      setShowNew(false);
      setSupplierId("");
      setPoItems([{ description: "", quantity: "1", unit_price: "0", purchase_type: "CONSUMABLE" }]);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/inventory/purchase-orders/${id}/approve`),
    onSuccess: () => {
      toast.success("PO approved");
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
    },
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
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to record GRN"),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-end"><Button size="sm" onClick={() => setShowNew(true)}>Create PO</Button></div>
        {!orders?.length ? <EmptyState title="No purchase orders yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">PO No</th><th className="py-2">Supplier</th><th className="py-2">Amount</th><th className="py-2">Status</th><th className="py-2"></th></tr></thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-b last:border-0">
                  <td className="py-2">{po.po_no}</td>
                  <td className="py-2">{po.supplier.name}</td>
                  <td className="py-2">৳{po.total_amount.toLocaleString()}</td>
                  <td className="py-2"><Badge>{po.status.replace(/_/g, " ")}</Badge></td>
                  <td className="py-2 space-x-2">
                    {po.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(po.id)}>Approve</Button>}
                    {(po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED") && <Button size="sm" onClick={() => setShowGrn(po)}>Receive (GRN)</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <div key={i} className="flex gap-2">
                  <Input placeholder="Description" value={item.description} onChange={(e) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, description: e.target.value } : it)))} />
                  <Select value={item.purchase_type} onValueChange={(v) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, purchase_type: v } : it)))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="CONSUMABLE">Consumable</SelectItem><SelectItem value="ASSET">Asset</SelectItem></SelectContent>
                  </Select>
                  <Input type="number" className="w-16" placeholder="Qty" value={item.quantity} onChange={(e) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, quantity: e.target.value } : it)))} />
                  <Input type="number" className="w-24" placeholder="Unit price" value={item.unit_price} onChange={(e) => setPoItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, unit_price: e.target.value } : it)))} />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setPoItems((prev) => [...prev, { description: "", quantity: "1", unit_price: "0", purchase_type: "CONSUMABLE" }])}>+ Add Item</Button>
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
  const { data } = useQuery<Grn[]>({ queryKey: ["inventory", "purchase-history"], queryFn: async () => (await api.get("/api/inventory/reports/purchase-history")).data.data });
  return (
    <Card>
      <CardContent className="pt-6">
        {!data?.length ? <EmptyState title="No GRNs yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">GRN No</th><th className="py-2">PO No</th><th className="py-2">Supplier</th><th className="py-2">Date</th><th className="py-2">Amount</th></tr></thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="py-2">{g.grn_no}</td>
                  <td className="py-2">{g.po.po_no}</td>
                  <td className="py-2">{g.po.supplier.name}</td>
                  <td className="py-2">{new Date(g.received_date).toLocaleDateString()}</td>
                  <td className="py-2">৳{g.total_amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
