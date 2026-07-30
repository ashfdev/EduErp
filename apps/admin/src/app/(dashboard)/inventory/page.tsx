"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Badge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface DashboardData {
  total_assets: number;
  total_book_value: number;
  total_items: number;
  low_stock_count: number;
  pending_pos: number;
  total_po_value_this_year: number;
  maintenance_due_count: number;
}

interface GrnSummary {
  id: string;
  grn_no: string;
  received_date: string;
  total_amount: number;
  po: { supplier: { name: string } };
}

function fmt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function InventoryDashboardPage() {
  const { data } = useQuery<DashboardData>({ queryKey: ["inventory", "dashboard"], queryFn: async () => (await api.get("/api/inventory/dashboard")).data.data });
  const { data: recentGrns, isLoading: grnsLoading, isError: grnsError, error: grnsErrorObj, refetch: refetchGrns } = useQuery<GrnSummary[]>({
    queryKey: ["inventory", "purchase-history"],
    queryFn: async () => (await api.get("/api/inventory/reports/purchase-history")).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Inventory"
        subtitle="Fixed assets, consumable stock, and the purchase workflow"
        breadcrumbs={[{ label: "Inventory" }]}
        action={
          <div className="flex gap-2">
            <Link href="/inventory/assets"><Button variant="outline" size="sm">Fixed Assets</Button></Link>
            <Link href="/inventory/stock"><Button variant="outline" size="sm">Stock</Button></Link>
            <Link href="/inventory/purchases"><Button size="sm">Purchases</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Assets</p><p className="text-2xl font-semibold">{data?.total_assets ?? 0}</p><p className="text-xs text-muted-foreground">Book value: {fmt(data?.total_book_value ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Items</p><p className="text-2xl font-semibold">{data?.total_items ?? 0}</p>{!!data?.low_stock_count && <Badge variant="destructive">Low Stock: {data.low_stock_count}</Badge>}</CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pending POs</p><p className="text-2xl font-semibold">{data?.pending_pos ?? 0}</p><p className="text-xs text-muted-foreground">{fmt(data?.total_po_value_this_year ?? 0)} this year</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Maintenance Due</p><p className="text-2xl font-semibold">{data?.maintenance_due_count ?? 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-3 font-medium">Recent Purchases</p>
          {grnsLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : grnsError ? (
            <ErrorState title="Failed to load recent purchases" description={extractErrorMessage(grnsErrorObj)} retryLabel="Retry" onRetry={() => refetchGrns()} />
          ) : !recentGrns?.length ? <EmptyState title="No purchases yet" /> : (
            <div className="space-y-2">
              {recentGrns.slice(0, 5).map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div><p className="font-medium">{g.grn_no}</p><p className="text-xs text-muted-foreground">{g.po.supplier.name}</p></div>
                  <span>{fmt(g.total_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
