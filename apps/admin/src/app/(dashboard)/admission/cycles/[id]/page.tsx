"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Checkbox, EmptyState, Input, Label, PageHeader, PageWrapper, StatusBadge, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Cycle {
  id: string;
  name: string;
  class: { name_en: string };
  seat_count: number;
  app_fee: number;
  is_open: boolean;
  is_published: boolean;
  merit_list_published_at: string | null;
  requires_test: boolean;
  test_date: string | null;
  test_venue: string | null;
  test_duration_minutes: number | null;
  test_instructions: string | null;
  admit_card_published_at: string | null;
  stats: { total_applications: number; shortlisted: number; waitlisted: number; confirmed: number; enrolled: number; rejected: number };
  seats_remaining: number;
}

interface SeatPlanRow {
  hall_name: string | null;
  seat_number: string | null;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
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
  const [sortBy, setSortBy] = useState<"applied" | "rank">("applied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
    onSuccess: (res) => {
      toast.success(`Notified ${res.data.data.notified} applicants`);
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id] });
    },
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

  // ── Admission Test workflow ──
  const [testForm, setTestForm] = useState({ requires_test: false, test_date: "", test_venue: "", test_duration_minutes: "", test_instructions: "" });
  const [halls, setHalls] = useState<{ name: string; capacity: string }[]>([{ name: "Hall A", capacity: "50" }]);
  const [seatStatuses, setSeatStatuses] = useState<string[]>(["SHORTLISTED"]);
  const [startSeat, setStartSeat] = useState("1");

  useEffect(() => {
    if (!cycle) return;
    setTestForm({
      requires_test: cycle.requires_test,
      test_date: cycle.test_date ? cycle.test_date.slice(0, 16) : "",
      test_venue: cycle.test_venue ?? "",
      test_duration_minutes: cycle.test_duration_minutes ? String(cycle.test_duration_minutes) : "",
      test_instructions: cycle.test_instructions ?? "",
    });
  }, [cycle]);

  const { data: seatPlan } = useQuery<SeatPlanRow[]>({
    queryKey: ["admission", "cycles", id, "seat-plan"],
    queryFn: async () => (await api.get(`/api/admission/cycles/${id}/test/seat-plan`)).data.data,
  });

  const scheduleTestMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admission/cycles/${id}/test`, {
        requires_test: testForm.requires_test,
        test_date: testForm.test_date || undefined,
        test_venue: testForm.test_venue || undefined,
        test_duration_minutes: testForm.test_duration_minutes ? Number(testForm.test_duration_minutes) : undefined,
        test_instructions: testForm.test_instructions || undefined,
      }),
    onSuccess: () => {
      toast.success("Test schedule saved");
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save"),
  });

  const seatPlanMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/admission/cycles/${id}/test/seat-plan`, {
        statuses: seatStatuses,
        halls: halls.filter((h) => h.name && h.capacity).map((h) => ({ name: h.name, capacity: Number(h.capacity) })),
        start_seat: Number(startSeat) || 1,
      }),
    onSuccess: (res) => {
      toast.success(`Seat plan generated for ${res.data.data.assigned} candidates${res.data.data.overflow ? ` — ${res.data.data.overflow} could not be seated (over capacity)` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id, "seat-plan"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to generate seat plan"),
  });

  const publishAdmitCardsMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/cycles/${id}/admit-card/publish`),
    onSuccess: (res) => {
      toast.success(`Notified ${res.data.data.notified} applicants`);
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to publish"),
  });

  async function downloadAllAdmitCards() {
    const res = await api.get(`/api/admission/cycles/${id}/admit-cards`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Admit_Cards_${cycle?.name ?? id}.pdf`;
    a.click();
  }

  function toggleSort(column: "applied" | "rank") {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }

  const sortedApplications = [...(applications ?? [])].sort((a, b) => {
    let cmp: number;
    if (sortBy === "rank") {
      // Unranked applications (null) always sort to the end regardless of direction.
      if (a.merit_rank == null && b.merit_rank == null) cmp = 0;
      else if (a.merit_rank == null) cmp = 1;
      else if (b.merit_rank == null) cmp = -1;
      else cmp = a.merit_rank - b.merit_rank;
    } else {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const meritList = (applications ?? [])
    .filter((a): a is Application & { merit_rank: number } => a.merit_rank != null)
    .sort((a, b) => a.merit_rank - b.merit_rank);

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
          <TabsTrigger value="test">Admission Test</TabsTrigger>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("rank")}>
                        Rank {sortBy === "rank" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("applied")}>
                        Applied On {sortBy === "applied" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedApplications.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell><Checkbox checked={selected.includes(a.id)} onCheckedChange={(v) => setSelected((prev) => (v ? [...prev, a.id] : prev.filter((x) => x !== a.id)))} /></TableCell>
                        <TableCell className="font-mono text-xs">{a.admission_roll ?? "-"}</TableCell>
                        <TableCell><Link href={`/admission/applications/${a.id}`} className="text-primary hover:underline">{a.applicant_name}</Link></TableCell>
                        <TableCell>{a.merit_rank ?? "-"}</TableCell>
                        <TableCell><StatusBadge status={a.status} /></TableCell>
                        <TableCell>{new Date(a.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="merit">
          <div className="flex items-center gap-2">
            <Button onClick={() => meritListMutation.mutate()} disabled={meritListMutation.isPending}>Generate Merit List</Button>
            <Button variant="outline" onClick={() => publishMeritListMutation.mutate()} disabled={publishMeritListMutation.isPending || !meritList.length}>Publish &amp; Notify</Button>
            {cycle.merit_list_published_at ? (
              <span className="text-xs text-emerald-600">Published {new Date(cycle.merit_list_published_at).toLocaleString()} — visible to applicants</span>
            ) : (
              <span className="text-xs text-muted-foreground">Not yet published — applicants can&apos;t see their rank until you click Publish &amp; Notify</span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ranks applications by previous-result merit score. Top {cycle.seat_count} become SHORTLISTED, the rest WAITLISTED.
          </p>

          {!meritList.length && <EmptyState title="No merit list generated yet" description="Click Generate Merit List to rank every application in this cycle." />}
          {!!meritList.length && (
            <Card className="mt-3">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {meritList.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">#{a.merit_rank}</TableCell>
                        <TableCell className="font-mono text-xs">{a.admission_roll ?? "-"}</TableCell>
                        <TableCell><Link href={`/admission/applications/${a.id}`} className="text-primary hover:underline">{a.applicant_name}</Link></TableCell>
                        <TableCell><StatusBadge status={a.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="font-medium">Schedule Test</p>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={testForm.requires_test} onCheckedChange={(v) => setTestForm((f) => ({ ...f, requires_test: v }))} />
                This cycle requires an offline admission test
              </label>
              {testForm.requires_test && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Test Date &amp; Time</Label><Input type="datetime-local" value={testForm.test_date} onChange={(e) => setTestForm((f) => ({ ...f, test_date: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Duration (minutes)</Label><Input type="number" min={1} value={testForm.test_duration_minutes} onChange={(e) => setTestForm((f) => ({ ...f, test_duration_minutes: e.target.value }))} /></div>
                  <div className="col-span-2 space-y-1.5"><Label className="text-xs">Venue</Label><Input value={testForm.test_venue} onChange={(e) => setTestForm((f) => ({ ...f, test_venue: e.target.value }))} placeholder="e.g. Main Campus, Room 101" /></div>
                  <div className="col-span-2 space-y-1.5"><Label className="text-xs">Instructions</Label><Textarea value={testForm.test_instructions} onChange={(e) => setTestForm((f) => ({ ...f, test_instructions: e.target.value }))} placeholder="e.g. Bring admit card and photo ID. No calculators allowed." /></div>
                </div>
              )}
              <Button size="sm" onClick={() => scheduleTestMutation.mutate()} disabled={scheduleTestMutation.isPending}>Save Schedule</Button>
            </CardContent>
          </Card>

          {testForm.requires_test && (
            <>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="font-medium">Seat Plan</p>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox checked={seatStatuses.includes("SHORTLISTED")} onCheckedChange={(v) => setSeatStatuses((prev) => (v ? [...prev, "SHORTLISTED"] : prev.filter((s) => s !== "SHORTLISTED")))} />
                      Shortlisted
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={seatStatuses.includes("WAITLISTED")} onCheckedChange={(v) => setSeatStatuses((prev) => (v ? [...prev, "WAITLISTED"] : prev.filter((s) => s !== "WAITLISTED")))} />
                      Waitlisted
                    </label>
                  </div>
                  <div className="space-y-2">
                    {halls.map((hall, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input className="w-48" placeholder="Hall name" value={hall.name} onChange={(e) => setHalls((prev) => prev.map((h, idx) => (idx === i ? { ...h, name: e.target.value } : h)))} />
                        <Input className="w-32" type="number" min={1} placeholder="Capacity" value={hall.capacity} onChange={(e) => setHalls((prev) => prev.map((h, idx) => (idx === i ? { ...h, capacity: e.target.value } : h)))} />
                        <Button size="sm" variant="outline" onClick={() => setHalls((prev) => prev.filter((_, idx) => idx !== i))} disabled={halls.length === 1}>Remove</Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => setHalls((prev) => [...prev, { name: "", capacity: "" }])}>+ Add Hall</Button>
                  </div>
                  <div className="w-32 space-y-1.5"><Label className="text-xs">Start Seat #</Label><Input type="number" min={1} value={startSeat} onChange={(e) => setStartSeat(e.target.value)} /></div>
                  <Button size="sm" onClick={() => seatPlanMutation.mutate()} disabled={seatPlanMutation.isPending || !seatStatuses.length}>Generate Seat Plan</Button>

                  {!!seatPlan?.length && (
                    <div className="mt-3 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hall</TableHead><TableHead>Seat</TableHead><TableHead>Roll</TableHead><TableHead>Applicant</TableHead><TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {seatPlan.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell>{s.hall_name}</TableCell>
                              <TableCell>{s.seat_number}</TableCell>
                              <TableCell className="font-mono text-xs">{s.admission_roll}</TableCell>
                              <TableCell>{s.applicant_name}</TableCell>
                              <TableCell><StatusBadge status={s.status} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="font-medium">Admit Cards</p>
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="outline" onClick={downloadAllAdmitCards} disabled={!seatPlan?.length}>Download All (PDF)</Button>
                    <Button size="sm" onClick={() => publishAdmitCardsMutation.mutate()} disabled={publishAdmitCardsMutation.isPending || !cycle.test_date}>Publish &amp; Notify</Button>
                    {cycle.admit_card_published_at ? (
                      <span className="text-xs text-emerald-600">Published {new Date(cycle.admit_card_published_at).toLocaleString()} — applicants can self-download</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not yet published — applicants can&apos;t download their admit card until you publish</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
