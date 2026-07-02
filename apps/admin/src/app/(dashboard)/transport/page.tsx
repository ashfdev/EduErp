"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Route {
  id: string;
  name: string;
  fare: number;
  is_active: boolean;
  stops: { id: string; name: string }[];
  _count: { vehicles: number; students: number };
}

export default function TransportDashboardPage() {
  const { data: routes } = useQuery<Route[]>({ queryKey: ["transport", "routes"], queryFn: async () => (await api.get("/api/transport/routes")).data.data });

  return (
    <PageWrapper>
      <PageHeader
        title="Transport"
        breadcrumbs={[{ label: "Transport" }]}
        action={
          <div className="flex gap-2">
            <Link href="/transport/assign"><Button variant="outline">Assign Student</Button></Link>
            <Link href="/transport/routes/new"><Button>+ New Route</Button></Link>
          </div>
        }
      />

      {!routes?.length && <EmptyState title="No routes configured yet" />}
      <div className="grid grid-cols-3 gap-4">
        {routes?.map((r) => (
          <Link key={r.id} href={`/transport/routes/${r.id}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="space-y-2 pt-6">
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-muted-foreground">{r.stops.length} stops · Fare ৳{r.fare}</p>
                <div className="flex gap-4 text-sm">
                  <span>{r._count.vehicles} vehicle(s)</span>
                  <span>{r._count.students} student(s)</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
