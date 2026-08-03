"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Cycle {
  id: string;
  name: string;
  class: { name_en: string };
  seat_count: number;
  app_fee: number;
  is_open: boolean;
  is_published: boolean;
  open_date: string;
  close_date: string;
  stats: { total_applications: number; shortlisted: number; waitlisted: number; confirmed: number; enrolled: number; rejected: number };
  seats_remaining: number;
}

export default function AdmissionDashboardPage() {
  const { data: cycles, isLoading, isError, error, refetch } = useQuery<Cycle[]>({ queryKey: ["admission", "cycles"], queryFn: async () => (await api.get("/api/admission/cycles")).data.data });

  return (
    <PageWrapper>
      <PageHeader
        title="Online Admission"
        subtitle="Manage admission cycles and applications"
        breadcrumbs={[{ label: "Admission" }]}
        action={
          <div className="flex gap-2">
            <Link href="/admission/applications"><Button variant="outline">All Applications</Button></Link>
            <Link href="/admission/cycles/new"><Button>+ New Cycle</Button></Link>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load admission cycles" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!cycles?.length && <EmptyState title="No admission cycles yet" description="Create a cycle to start accepting applications" />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cycles?.map((c) => (
          <Link key={c.id} href={`/admission/cycles/${c.id}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{c.class?.name_en}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={c.is_open ? "OPEN" : "CLOSED"} />
                    {!c.is_published && <StatusBadge status="DRAFT" />}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div><p className="text-lg font-semibold">{c.stats.total_applications}</p><p className="text-muted-foreground">Applied</p></div>
                  <div><p className="text-lg font-semibold">{c.stats.shortlisted + c.stats.confirmed}</p><p className="text-muted-foreground">Shortlisted</p></div>
                  <div><p className="text-lg font-semibold">{c.seats_remaining}</p><p className="text-muted-foreground">Seats Left</p></div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.open_date).toLocaleDateString()} – {new Date(c.close_date).toLocaleDateString()} · {c.seat_count} seats · ৳{c.app_fee} fee
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
        </>
      )}
    </PageWrapper>
  );
}
