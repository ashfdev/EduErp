"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Input, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AssetRegisterRow { asset_uid: string; name: string; category: string; purchase_price: number; accumulated_dep: number; book_value: number; status: string }
interface DepreciationScheduleRow { asset_uid: string; name: string; purchase_price: number; rate: number; annual_dep: number; monthly_dep: number; accumulated_dep: number; book_value: number }
interface StockReportRow { item_code: string; name: string; category: string; unit: string; current_stock: number; minimum_stock: number; status: string }

function AssetRegisterTab() {
  const { data } = useQuery<AssetRegisterRow[]>({ queryKey: ["inventory", "reports", "asset-register"], queryFn: async () => (await api.get("/api/inventory/reports/asset-register")).data.data });
  if (!data?.length) return <EmptyState title="No assets yet" />;
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">UID</th><th className="py-2">Name</th><th className="py-2">Category</th><th className="py-2">Purchase Price</th><th className="py-2">Accum. Dep</th><th className="py-2">Book Value</th></tr></thead>
      <tbody>{data.map((a) => (
        <tr key={a.asset_uid} className="border-b last:border-0">
          <td className="py-2 font-mono">{a.asset_uid}</td><td className="py-2">{a.name}</td><td className="py-2">{a.category}</td>
          <td className="py-2">৳{a.purchase_price.toLocaleString()}</td><td className="py-2">৳{a.accumulated_dep.toLocaleString()}</td><td className="py-2">৳{a.book_value.toLocaleString()}</td>
        </tr>
      ))}</tbody>
    </table>
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
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">UID</th><th className="py-2">Name</th><th className="py-2">Price</th><th className="py-2">Rate</th><th className="py-2">Annual</th><th className="py-2">Monthly</th><th className="py-2">Book Value</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.asset_uid} className="border-b last:border-0">
              <td className="py-2 font-mono">{a.asset_uid}</td><td className="py-2">{a.name}</td><td className="py-2">৳{a.purchase_price.toLocaleString()}</td>
              <td className="py-2">{a.rate}%</td><td className="py-2">৳{a.annual_dep.toLocaleString()}</td><td className="py-2">৳{a.monthly_dep.toLocaleString()}</td><td className="py-2">৳{a.book_value.toLocaleString()}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function StockReportTab() {
  const { data } = useQuery<StockReportRow[]>({ queryKey: ["inventory", "reports", "stock-report"], queryFn: async () => (await api.get("/api/inventory/reports/stock-report")).data.data });
  if (!data?.length) return <EmptyState title="No items yet" />;
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Code</th><th className="py-2">Name</th><th className="py-2">Category</th><th className="py-2">Stock</th><th className="py-2">Min</th><th className="py-2">Status</th></tr></thead>
      <tbody>{data.map((i) => (
        <tr key={i.item_code} className="border-b last:border-0">
          <td className="py-2 font-mono">{i.item_code}</td><td className="py-2">{i.name}</td><td className="py-2">{i.category}</td>
          <td className="py-2">{i.current_stock} {i.unit}</td><td className="py-2">{i.minimum_stock}</td>
          <td className={`py-2 ${i.status === "OUT_OF_STOCK" ? "text-red-600" : i.status === "LOW" ? "text-orange-600" : ""}`}>{i.status.replace(/_/g, " ")}</td>
        </tr>
      ))}</tbody>
    </table>
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
