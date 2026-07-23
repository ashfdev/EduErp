"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Input, Label, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AssetRegisterRow { asset_uid: string; name: string; category: string; purchase_price: number; accumulated_dep: number; book_value: number; status: string }
interface DepreciationScheduleRow { asset_uid: string; name: string; purchase_price: number; rate: number; annual_dep: number; monthly_dep: number; accumulated_dep: number; book_value: number }
interface StockReportRow { item_code: string; name: string; category: string; unit: string; current_stock: number; minimum_stock: number; status: string }

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

export default function InventoryReportsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Inventory Reports" breadcrumbs={[{ label: "Inventory" }, { label: "Reports" }]} />
      <Tabs defaultValue="asset-register">
        <TabsList>
          <TabsTrigger value="asset-register">Asset Register</TabsTrigger>
          <TabsTrigger value="depreciation">Depreciation Schedule</TabsTrigger>
          <TabsTrigger value="stock">Stock Report</TabsTrigger>
        </TabsList>
        <TabsContent value="asset-register"><Card><CardContent className="pt-6"><AssetRegisterTab /></CardContent></Card></TabsContent>
        <TabsContent value="depreciation"><Card><CardContent className="pt-6"><DepreciationScheduleTab /></CardContent></Card></TabsContent>
        <TabsContent value="stock"><Card><CardContent className="pt-6"><StockReportTab /></CardContent></Card></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
