"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AssetRegisterRow { asset_uid: string; name: string; category: string; purchase_price: number; accumulated_dep: number; book_value: number; status: string }
interface DepreciationScheduleRow { asset_uid: string; name: string; purchase_price: number; rate: number; annual_dep: number; monthly_dep: number; accumulated_dep: number; book_value: number }
interface StockReportRow { item_code: string; name: string; category: string; unit: string; current_stock: number; minimum_stock: number; status: string }
interface Supplier { id: string; name: string }
interface Grn {
  id: string;
  grn_no: string;
  received_date: string;
  total_amount: number;
  po: { po_no: string; supplier: { name: string } };
}

function AssetRegisterTab() {
  const { data } = useQuery<AssetRegisterRow[]>({ queryKey: ["inventory", "reports", "asset-register"], queryFn: async () => (await api.get("/api/inventory/reports/asset-register")).data.data });
  if (!data?.length) return <EmptyState title="No assets yet" />;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>UID</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Purchase Price</TableHead><TableHead>Accum. Dep</TableHead><TableHead>Book Value</TableHead></TableRow>
      </TableHeader>
      <TableBody>{data.map((a) => (
        <TableRow key={a.asset_uid}>
          <TableCell className="font-mono">{a.asset_uid}</TableCell><TableCell>{a.name}</TableCell><TableCell>{a.category}</TableCell>
          <TableCell>৳{a.purchase_price.toLocaleString()}</TableCell><TableCell>৳{a.accumulated_dep.toLocaleString()}</TableCell><TableCell>৳{a.book_value.toLocaleString()}</TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  );
}

function DepreciationScheduleTab() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(new Date().toLocaleString("en-US", { month: "long", year: "numeric" }));
  const { data } = useQuery<DepreciationScheduleRow[]>({ queryKey: ["inventory", "reports", "depreciation-schedule"], queryFn: async () => (await api.get("/api/inventory/reports/depreciation-schedule")).data.data });

  const runMutation = useMutation({
    mutationFn: () => api.post("/api/inventory/depreciation/calculate", { period, financial_year: "2026-2027" }),
    onSuccess: (res) => {
      toast.success(`Depreciation run: ${res.data.data.processed} asset(s), ৳${res.data.data.total_dep_amount.toLocaleString()} total`);
      queryClient.invalidateQueries({ queryKey: ["inventory", "reports", "depreciation-schedule"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="space-y-1.5"><Label className="text-xs">Period</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48" /></div>
        <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>Run Monthly Depreciation</Button>
      </div>
      {!data?.length ? <EmptyState title="No active assets" /> : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>UID</TableHead><TableHead>Name</TableHead><TableHead>Price</TableHead><TableHead>Rate</TableHead><TableHead>Annual</TableHead><TableHead>Monthly</TableHead><TableHead>Book Value</TableHead></TableRow>
          </TableHeader>
          <TableBody>{data.map((a) => (
            <TableRow key={a.asset_uid}>
              <TableCell className="font-mono">{a.asset_uid}</TableCell><TableCell>{a.name}</TableCell><TableCell>৳{a.purchase_price.toLocaleString()}</TableCell>
              <TableCell>{a.rate}%</TableCell><TableCell>৳{a.annual_dep.toLocaleString()}</TableCell><TableCell>৳{a.monthly_dep.toLocaleString()}</TableCell><TableCell>৳{a.book_value.toLocaleString()}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </div>
  );
}

function StockReportTab() {
  const { data } = useQuery<StockReportRow[]>({ queryKey: ["inventory", "reports", "stock-report"], queryFn: async () => (await api.get("/api/inventory/reports/stock-report")).data.data });
  if (!data?.length) return <EmptyState title="No items yet" />;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Stock</TableHead><TableHead>Min</TableHead><TableHead>Status</TableHead></TableRow>
      </TableHeader>
      <TableBody>{data.map((i) => (
        <TableRow key={i.item_code}>
          <TableCell className="font-mono">{i.item_code}</TableCell><TableCell>{i.name}</TableCell><TableCell>{i.category}</TableCell>
          <TableCell>{i.current_stock} {i.unit}</TableCell><TableCell>{i.minimum_stock}</TableCell>
          <TableCell className={i.status === "OUT_OF_STOCK" ? "text-red-600" : i.status === "LOW" ? "text-orange-600" : ""}>{i.status.replace(/_/g, " ")}</TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  );
}

function PurchaseHistoryTab() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["inventory", "suppliers"], queryFn: async () => (await api.get("/api/inventory/suppliers")).data.data });
  const { data } = useQuery<Grn[]>({
    queryKey: ["inventory", "reports", "purchase-history", fromDate, toDate, supplierId],
    queryFn: async () =>
      (
        await api.get("/api/inventory/reports/purchase-history", {
          params: { from_date: fromDate || undefined, to_date: toDate || undefined, supplier_id: supplierId || undefined },
        })
      ).data.data,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
        <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        <div className="space-y-1.5">
          <Label className="text-xs">Supplier</Label>
          <Select value={supplierId || "all"} onValueChange={(v) => setSupplierId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!data?.length ? <EmptyState title="No GRNs in this range" /> : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>GRN No</TableHead><TableHead>PO No</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead></TableRow>
          </TableHeader>
          <TableBody>{data.map((g) => (
            <TableRow key={g.id}>
              <TableCell>{g.grn_no}</TableCell><TableCell>{g.po.po_no}</TableCell><TableCell>{g.po.supplier.name}</TableCell>
              <TableCell>{new Date(g.received_date).toLocaleDateString()}</TableCell><TableCell>৳{g.total_amount.toLocaleString()}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </div>
  );
}

export default function InventoryReportsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Inventory Reports" breadcrumbs={[{ label: "Inventory" }, { label: "Reports" }]} />
      <Tabs defaultValue="asset-register">
        <TabsList>
          <TabsTrigger value="asset-register">Asset Register</TabsTrigger>
          <TabsTrigger value="depreciation">Depreciation Schedule</TabsTrigger>
          <TabsTrigger value="stock">Stock Report</TabsTrigger>
          <TabsTrigger value="purchase-history">Purchase History</TabsTrigger>
        </TabsList>
        <TabsContent value="asset-register"><Card><CardContent className="pt-6"><AssetRegisterTab /></CardContent></Card></TabsContent>
        <TabsContent value="depreciation"><Card><CardContent className="pt-6"><DepreciationScheduleTab /></CardContent></Card></TabsContent>
        <TabsContent value="stock"><Card><CardContent className="pt-6"><StockReportTab /></CardContent></Card></TabsContent>
        <TabsContent value="purchase-history"><Card><CardContent className="pt-6"><PurchaseHistoryTab /></CardContent></Card></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
