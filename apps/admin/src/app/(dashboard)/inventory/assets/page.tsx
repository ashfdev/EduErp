"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Badge, EmptyState, Input } from "@education-erp/ui";
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
  const { data } = useQuery<{ items: Asset[] }>({
    queryKey: ["inventory", "assets", search],
    queryFn: async () => ({ items: (await api.get("/api/inventory/assets", { params: { search: search || undefined, limit: 50 } })).data.data }),
  });

  return (
    <PageWrapper>
      <PageHeader title="Fixed Assets" breadcrumbs={[{ label: "Inventory" }, { label: "Assets" }]} action={<Link href="/inventory/assets/new"><Button size="sm">+ Add Asset</Button></Link>} />

      <Card>
        <CardContent className="pt-6">
          <Input placeholder="Search by name, UID, or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {!data?.items.length ? (
            <EmptyState title="No assets yet" description="Add a fixed asset, or receive one via a purchase order GRN." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Asset UID</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Department</th>
                    <th className="py-2 pr-4">Purchase Price</th>
                    <th className="py-2 pr-4">Book Value</th>
                    <th className="py-2 pr-4">Condition</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-accent">
                      <td className="py-2 pr-4"><Link href={`/inventory/assets/${a.id}`} className="font-mono text-primary">{a.asset_uid}</Link></td>
                      <td className="py-2 pr-4">{a.name}</td>
                      <td className="py-2 pr-4">{a.category.name}</td>
                      <td className="py-2 pr-4">{a.department?.name_en ?? "—"}</td>
                      <td className="py-2 pr-4">৳{a.purchase_price.toLocaleString()}</td>
                      <td className="py-2 pr-4">৳{a.book_value.toLocaleString()}</td>
                      <td className="py-2 pr-4"><Badge className={CONDITION_COLOR[a.condition]}>{a.condition}</Badge></td>
                      <td className="py-2 pr-4"><Badge className={STATUS_COLOR[a.status]}>{a.status.replace(/_/g, " ")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
