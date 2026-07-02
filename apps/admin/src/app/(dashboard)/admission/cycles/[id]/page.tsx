"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Checkbox, Switch, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Cycle {
  id: string;
  name: string;
  class: { name_en: string };
  seat_count: number;
  app_fee: number;
  is_open: boolean;
  is_published: boolean;
  stats: { total_applications: number; shortlisted: number; waitlisted: number; confirmed: number; enrolled: number; rejected: number };
  seats_remaining: number;
}

interface Application {
  id: string;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
  merit_rank: number | null;
  created_at: string;
}

export default function AdmissionCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data: cycle } = useQuery<Cycle>({ queryKey: ["admission", "cycles", id], queryFn: async () => (await api.get(`/api/admission/cycles/${id}`)).data.data });
  const { data: applications } = useQuery<Application[]>({
    queryKey: ["admission", "applications", id, statusFilter],
    queryFn: async () => (await api.get("/api/admission/applications", { params: { cycle_id: id, status: statusFilter || undefined, limit: 100 } })).data.data,
  });

  const toggleMutation = useMutation({
    mutationFn: (patch: { is_open?: boolean; is_published?: boolean }) => api.put(`/api/admission/cycles/${id}/toggle`, patch),
    onSuccess: () => {
      toast.success("Cycle updated");
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id] });
    },
  });

  const meritListMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/cycles/${id}/merit-list`),
    onSuccess: () => {
      toast.success("Merit list generated");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", id] });
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id] });
    },
    onError: () => toast.error("Failed to generate merit list"),
  });

  const publishMeritListMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/cycles/${id}/merit-list/publish`),
    onSuccess: (res) => toast.success(`Notified ${res.data.data.notified} applicants`),
  });

  const bulkActionMutation = useMutation({
    mutationFn: (status: "SHORTLISTED" | "WAITLISTED" | "REJECTED") =>
      api.post("/api/admission/applications/bulk-action", { application_ids: selected, status }),
    onSuccess: () => {
      toast.success("Bulk action applied");
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", id] });
    },
  });

  if (!cycle) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  return (
    <PageWrapper>
      <PageHeader
        title={cycle.name}
        breadcrumbs={[{ label: "Admission", href: "/admission" }, { label: cycle.name }]}
        action={
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={cycle.is_open} onCheckedChange={(v) => toggleMutation.mutate({ is_open: v })} /> Open</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={cycle.is_published} onCheckedChange={(v) => toggleMutation.mutate({ is_published: v })} /> Published</label>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
        <Card><CardContent className="pt-6 text-center"><p className="text-xl font-semibold">{cycle.stats.total_applications}</p><p className="text-xs text-muted-foreground">Applied</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xl font-semibold">{cycle.stats.shortlisted}</p><p className="text-xs text-muted-foreground">Shortlisted</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xl font-semibold">{cycle.stats.waitlisted}</p><p className="text-xs text-muted-foreground">Waitlisted</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xl font-semibold">{cycle.stats.confirmed}</p><p className="text-xs text-muted-foreground">Confirmed</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xl font-semibold">{cycle.stats.enrolled}</p><p className="text-xs text-muted-foreground">Enrolled</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-xl font-semibold">{cycle.seats_remaining}</p><p className="text-xs text-muted-foreground">Seats Left</p></CardContent></Card>
      </div>

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="merit">Merit List</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <div className="mb-3 flex items-center justify-between">
            <select className="w-48 rounded-md border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="WAITLISTED">Waitlisted</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="ENROLLED">Enrolled</option>
              <option value="REJECTED">Rejected</option>
            </select>
            {selected.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => bulkActionMutation.mutate("SHORTLISTED")}>Shortlist ({selected.length})</Button>
                <Button size="sm" variant="outline" onClick={() => bulkActionMutation.mutate("WAITLISTED")}>Waitlist</Button>
                <Button size="sm" variant="destructive" onClick={() => bulkActionMutation.mutate("REJECTED")}>Reject</Button>
              </div>
            )}
          </div>
          {!applications?.length && <EmptyState title="No applications found" />}
          {!!applications?.length && (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2"></th>
                      <th className="p-2">Roll</th>
                      <th className="p-2">Applicant</th>
                      <th className="p-2">Rank</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Applied On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((a) => (
                      <tr key={a.id} className="border-b">
                        <td className="p-2"><Checkbox checked={selected.includes(a.id)} onCheckedChange={(v) => setSelected((prev) => (v ? [...prev, a.id] : prev.filter((x) => x !== a.id)))} /></td>
                        <td className="p-2 font-mono text-xs">{a.admission_roll ?? "-"}</td>
                        <td className="p-2"><Link href={`/admission/applications/${a.id}`} className="text-primary hover:underline">{a.applicant_name}</Link></td>
                        <td className="p-2">{a.merit_rank ?? "-"}</td>
                        <td className="p-2"><StatusBadge status={a.status} /></td>
                        <td className="p-2">{new Date(a.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="merit">
          <div className="flex gap-2">
            <Button onClick={() => meritListMutation.mutate()} disabled={meritListMutation.isPending}>Generate Merit List</Button>
            <Button variant="outline" onClick={() => publishMeritListMutation.mutate()} disabled={publishMeritListMutation.isPending}>Publish &amp; Notify</Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ranks applications by previous-result merit score. Top {cycle.seat_count} become SHORTLISTED, the rest WAITLISTED. Switch to the Applications tab and sort by Rank to review.
          </p>
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
