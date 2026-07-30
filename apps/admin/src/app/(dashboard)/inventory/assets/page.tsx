"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Badge, EmptyState, Input, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Asset {
  id: string;
  asset_uid: string;
  name: string;
  purchase_price: number;
  book_value: number;
  condition: string;
  status: string;
  category: { name: string };
  department: { name_en: string } | null;
}

const CONDITION_COLOR: Record<string, string> = {
  EXCELLENT: "bg-green-100 text-green-800",
  GOOD: "bg-blue-100 text-blue-800",
  FAIR: "bg-yellow-100 text-yellow-800",
  POOR: "bg-orange-100 text-orange-800",
  DAMAGED: "bg-red-100 text-red-800",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  UNDER_REPAIR: "bg-orange-100 text-orange-800",
  DISPOSED: "bg-gray-100 text-gray-600",
  LOST: "bg-red-100 text-red-800",
  TRANSFERRED: "bg-blue-100 text-blue-800",
};

export default function AssetsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery<{ items: Asset[] }>({
    queryKey: ["inventory", "assets", search],
    queryFn: async () => ({ items: (await api.get("/api/inventory/assets", { params: { search: search || undefined, limit: 50 } })).data.data }),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Fixed Assets"
        breadcrumbs={[{ label: "Inventory" }, { label: "Assets" }]}
        action={
          <div className="flex gap-2">
            <Link href="/inventory/asset-categories"><Button variant="outline" size="sm">Asset Categories</Button></Link>
            <Link href="/inventory/assets/new"><Button size="sm">+ Add Asset</Button></Link>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Input placeholder="Search by name, UID, or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load assets" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !data?.items.length ? (
            <EmptyState title="No assets yet" description="Add a fixed asset, or receive one via a purchase order GRN." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset UID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Purchase Price</TableHead>
                  <TableHead>Book Value</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Link href={`/inventory/assets/${a.id}`} className="font-mono text-primary">{a.asset_uid}</Link></TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.category.name}</TableCell>
                    <TableCell>{a.department?.name_en ?? "—"}</TableCell>
                    <TableCell>৳{a.purchase_price.toLocaleString()}</TableCell>
                    <TableCell>৳{a.book_value.toLocaleString()}</TableCell>
                    <TableCell><Badge className={CONDITION_COLOR[a.condition]}>{a.condition}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_COLOR[a.status]}>{a.status.replace(/_/g, " ")}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
