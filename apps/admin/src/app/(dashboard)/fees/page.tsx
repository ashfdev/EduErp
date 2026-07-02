"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button } from "@education-erp/ui";
import { api } from "@/lib/api";

export default function FeesDashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const { data: daily } = useQuery({
    queryKey: ["fees", "reports", "daily", today],
    queryFn: async () => (await api.get("/api/fees/reports/daily-collection", { params: { date: today } })).data.data,
  });
  const { data: monthly } = useQuery({
    queryKey: ["fees", "reports", "monthly", now.getMonth() + 1, now.getFullYear()],
    queryFn: async () => (await api.get("/api/fees/reports/monthly-summary", { params: { month: now.getMonth() + 1, year: now.getFullYear() } })).data.data,
  });
  const { data: defaulters } = useQuery({
    queryKey: ["fees", "reports", "defaulters"],
    queryFn: async () => (await api.get("/api/fees/reports/defaulters")).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Fee & Finance"
        breadcrumbs={[{ label: "Fees" }]}
        action={
          <div className="flex gap-2">
            <Link href="/fees/structures"><Button variant="outline">Fee Structures</Button></Link>
            <Link href="/fees/collect"><Button>Collect Fee</Button></Link>
          </div>
        }
      />
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold">৳{daily?.total ?? 0}</p><p className="text-sm text-muted-foreground">Today's Collection</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold">৳{monthly?.total ?? 0}</p><p className="text-sm text-muted-foreground">This Month</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold">{defaulters?.length ?? 0}</p><p className="text-sm text-muted-foreground">Defaulters (30+ days)</p></CardContent></Card>
        <Card><CardContent className="pt-6"><Link href="/fees/invoices" className="text-primary hover:underline">View Invoices →</Link><br /><Link href="/fees/reports" className="text-primary hover:underline">View Reports →</Link></CardContent></Card>
      </div>
    </PageWrapper>
  );
}
