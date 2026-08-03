"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Checkbox, EmptyState, Input, Label, PageHeader, PageWrapper, StatusBadge, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
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
  requires_written_test: boolean;
  written_test_date: string | null;
  written_test_venue: string | null;
  written_test_duration_minutes: number | null;
  written_test_instructions: string | null;
  requires_interview: boolean;
  interview_date: string | null;
  interview_venue: string | null;
  interview_duration_minutes: number | null;
  interview_instructions: string | null;
  stats: { total_applications: number; shortlisted: number; waitlisted: number; confirmed: number; enrolled: number; rejected: number };
  seats_remaining: number;
}

type StageType = "WRITTEN_TEST" | "INTERVIEW";

interface StagePreviewRow {
  id: string;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
  merit_rank: number | null;
  stage: {
    scheduled_date: string | null;
    venue: string | null;
    hall_name: string | null;
    seat_number: string | null;
    status: string;
    notified_at: string | null;
  } | null;
}

interface Application {
  id: string;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
  merit_rank: number | null;
  created_at: string;
  payment_status: "NOT_REQUIRED" | "DUE" | "PARTIAL" | "PENDING_VERIFICATION" | "PAID";
}

const PAYMENT_STATUS_LABEL: Record<Application["payment_status"], string> = {
  NOT_REQUIRED: "N/A",
  DUE: "Due",
  PARTIAL: "Partial",
  PENDING_VERIFICATION: "Verifying",
  PAID: "Paid",
};
const PAYMENT_STATUS_CLASS: Record<Application["payment_status"], string> = {
  NOT_REQUIRED: "bg-muted text-muted-foreground",
  DUE: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  PENDING_VERIFICATION: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
};
function PaymentStatusBadge({ status }: { status: Application["payment_status"] }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_CLASS[status]}`}>{PAYMENT_STATUS_LABEL[status]}</span>;
}

interface FormField {
  key: string;
  label_en: string;
  label_bn?: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "PHONE" | "EMAIL" | "TEXTAREA" | "FILE";
  required: boolean;
  is_default: boolean;
  display_order: number;
  options?: string[];
}
interface DocumentUploadField {
  key: string;
  label_en: string;
  required: boolean;
}
interface FormConfig {
  fields: FormField[];
  document_uploads: DocumentUploadField[];
}
const emptyFormField: FormField = { key: "", label_en: "", type: "TEXT", required: false, is_default: false, display_order: 0 };
const emptyDocUpload: DocumentUploadField = { key: "", label_en: "", required: false };

export default function AdmissionCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"applied" | "rank">("applied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: cycle, isLoading, isError, error, refetch } = useQuery<Cycle>({ queryKey: ["admission", "cycles", id], queryFn: async () => (await api.get(`/api/admission/cycles/${id}`)).data.data });
  const { data: applications } = useQuery<Application[]>({
    queryKey: ["admission", "applications", id, statusFilter, paymentStatusFilter],
    queryFn: async () =>
      (
        await api.get("/api/admission/applications", {
          params: { cycle_id: id, status: statusFilter || undefined, payment_status: paymentStatusFilter || undefined, limit: 100 },
        })
      ).data.data,
  });

  const toggleMutation = useMutation({
    mutationFn: (patch: { is_open?: boolean; is_published?: boolean }) => api.put(`/api/admission/cycles/${id}/toggle`, patch),
    onSuccess: () => {
      toast.success("Cycle updated");
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update cycle"),
  });

  const meritListMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/cycles/${id}/merit-list`),
    onSuccess: (res) => {
      const skippedUnpaid: { id: string; applicant_name: string }[] | undefined = res.data.skipped_unpaid;
      toast.success("Merit list generated");
      if (skippedUnpaid?.length) {
        toast(`${skippedUnpaid.length} applicant(s) skipped — payment not complete: ${skippedUnpaid.map((s) => s.applicant_name).join(", ")}`, { duration: 10000 });
      }
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
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to publish merit list"),
  });

  const bulkActionMutation = useMutation({
    mutationFn: (status: "SHORTLISTED" | "WAITLISTED" | "REJECTED") =>
      api.post("/api/admission/applications/bulk-action", { application_ids: selected, status }),
    onSuccess: (res) => {
      // Response is now {succeeded, skipped: [{id, reason}]} instead of a
      // bare count -- bulk-action is per-row-validated now (Plan Twenty-
      // Three, Phase 1), so some rows in a mixed-status selection can be
      // legitimately skipped (e.g. a REJECTED row can't move backward) while
      // the rest still succeed. Surface both, don't just report a total.
      const { succeeded, skipped } = res.data.data as { succeeded: string[]; skipped: { id: string; reason: string }[] };
      if (succeeded.length) toast.success(`Updated ${succeeded.length} application${succeeded.length === 1 ? "" : "s"}`);
      if (skipped.length) {
        const reasons = [...new Set(skipped.map((s) => s.reason))].join("; ");
        toast.error(`${skipped.length} skipped: ${reasons}`, { duration: 8000 });
      }
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to apply bulk action"),
  });

  // ── Custom application-form fields (form_config) ──
  // Backend (GET/PUT /cycles/:id/form-config) and the public website wizard
  // that reads and renders these fields already existed and worked — the
  // only missing piece was an admin UI to actually author them, which is
  // what this section adds.
  const { data: formConfig } = useQuery<FormConfig | null>({
    queryKey: ["admission", "cycles", id, "form-config"],
    queryFn: async () => (await api.get(`/api/admission/cycles/${id}/form-config`)).data.data,
  });
  const [customFields, setCustomFields] = useState<FormField[]>([]);
  const [docUploads, setDocUploads] = useState<DocumentUploadField[]>([]);
  useEffect(() => {
    setCustomFields((formConfig?.fields ?? []).filter((f) => !f.is_default));
    setDocUploads(formConfig?.document_uploads ?? []);
  }, [formConfig]);

  const saveFormConfigMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admission/cycles/${id}/form-config`, {
        fields: customFields.map((f, i) => ({ ...f, display_order: i })),
        document_uploads: docUploads,
      }),
    onSuccess: () => {
      toast.success("Application form fields saved");
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", id, "form-config"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save form fields"),
  });

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

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      </PageWrapper>
    );
  }

  if (isError || !cycle) {
    return (
      <PageWrapper>
        <ErrorState title="Failed to load admission cycle" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      </PageWrapper>
    );
  }

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
          <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
          <TabsTrigger value="form">Application Form</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-2">
              <select className="w-48 rounded-md border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="SHORTLISTED">Shortlisted</option>
                <option value="WAITLISTED">Waitlisted</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="ENROLLED">Enrolled</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select className="w-40 rounded-md border px-3 py-2 text-sm" value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
                <option value="">All Payments</option>
                <option value="DUE">Due</option>
                <option value="PARTIAL">Partial</option>
                <option value="PENDING_VERIFICATION">Verifying</option>
                <option value="PAID">Paid</option>
                <option value="NOT_REQUIRED">N/A</option>
              </select>
            </div>
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
                      <TableHead>Payment</TableHead>
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
                        <TableCell><PaymentStatusBadge status={a.payment_status} /></TableCell>
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

        <TabsContent value="scheduling" className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Written Test</h3>
            <StageSchedulingPanel cycleId={id} stageType="WRITTEN_TEST" cycle={cycle} queryClient={queryClient} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Interview</h3>
            <StageSchedulingPanel cycleId={id} stageType="INTERVIEW" cycle={cycle} queryClient={queryClient} />
          </div>
        </TabsContent>

        <TabsContent value="form" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Custom Application Fields</p>
                  <p className="text-sm text-muted-foreground">
                    Extra fields shown on the public application form for this cycle, beyond the built-in name/guardian/contact fields.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setCustomFields((prev) => [...prev, { ...emptyFormField }])}>
                  + Add Field
                </Button>
              </div>

              {!customFields.length && <EmptyState title="No custom fields" description="The application form will only ask for the built-in fields." />}

              {customFields.map((f, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-6 sm:items-end">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Field Key</Label>
                    <Input
                      value={f.key}
                      placeholder="blood_group"
                      onChange={(e) => setCustomFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, key: e.target.value } : x)))}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={f.label_en}
                      placeholder="Blood Group"
                      onChange={(e) => setCustomFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, label_en: e.target.value } : x)))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <select
                      className="w-full rounded-md border px-2 py-2 text-sm"
                      value={f.type}
                      onChange={(e) => setCustomFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, type: e.target.value as FormField["type"] } : x)))}
                    >
                      {(["TEXT", "NUMBER", "DATE", "SELECT", "PHONE", "EMAIL", "TEXTAREA", "FILE"] as const).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={f.required} onCheckedChange={(v) => setCustomFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, required: v === true } : x)))} />
                    <Label className="text-xs">Required</Label>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCustomFields((prev) => prev.filter((_, xi) => xi !== i))}>
                    Remove
                  </Button>
                  {f.type === "SELECT" && (
                    <div className="space-y-1 sm:col-span-6">
                      <Label className="text-xs">Options (comma-separated)</Label>
                      <Input
                        value={(f.options ?? []).join(", ")}
                        onChange={(e) =>
                          setCustomFields((prev) =>
                            prev.map((x, xi) => (xi === i ? { ...x, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : x)),
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Required Document Uploads</p>
                  <p className="text-sm text-muted-foreground">Documents an applicant must upload with their application.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDocUploads((prev) => [...prev, { ...emptyDocUpload }])}>
                  + Add Document
                </Button>
              </div>

              {!docUploads.length && <EmptyState title="No required documents" description="Applicants won't be asked to upload anything." />}

              {docUploads.map((d, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-4 sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Key</Label>
                    <Input value={d.key} placeholder="birth_certificate" onChange={(e) => setDocUploads((prev) => prev.map((x, xi) => (xi === i ? { ...x, key: e.target.value } : x)))} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Label</Label>
                    <Input value={d.label_en} placeholder="Birth Certificate" onChange={(e) => setDocUploads((prev) => prev.map((x, xi) => (xi === i ? { ...x, label_en: e.target.value } : x)))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={d.required} onCheckedChange={(v) => setDocUploads((prev) => prev.map((x, xi) => (xi === i ? { ...x, required: v === true } : x)))} />
                    <Label className="text-xs">Required</Label>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDocUploads((prev) => prev.filter((_, xi) => xi !== i))}>
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            onClick={() => saveFormConfigMutation.mutate()}
            disabled={saveFormConfigMutation.isPending || customFields.some((f) => !f.key || !f.label_en) || docUploads.some((d) => !d.key || !d.label_en)}
          >
            {saveFormConfigMutation.isPending ? "Saving..." : "Save Application Form"}
          </Button>
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

// Plan Twenty-Three Phase 5 -- Written Test and Interview are two
// independent, separately-schedulable stages; this same panel is rendered
// twice (once per stageType) rather than duplicating the whole workflow.
function StageSchedulingPanel({ cycleId, stageType, cycle, queryClient }: { cycleId: string; stageType: StageType; cycle: Cycle; queryClient: QueryClient }) {
  const isWrittenTest = stageType === "WRITTEN_TEST";
  const label = isWrittenTest ? "Written Test" : "Interview";

  const [defaults, setDefaults] = useState({ requires: false, scheduled_date: "", venue: "", duration_minutes: "", instructions: "" });
  useEffect(() => {
    setDefaults(
      isWrittenTest
        ? {
            requires: cycle.requires_written_test,
            scheduled_date: cycle.written_test_date ? cycle.written_test_date.slice(0, 16) : "",
            venue: cycle.written_test_venue ?? "",
            duration_minutes: cycle.written_test_duration_minutes ? String(cycle.written_test_duration_minutes) : "",
            instructions: cycle.written_test_instructions ?? "",
          }
        : {
            requires: cycle.requires_interview,
            scheduled_date: cycle.interview_date ? cycle.interview_date.slice(0, 16) : "",
            venue: cycle.interview_venue ?? "",
            duration_minutes: cycle.interview_duration_minutes ? String(cycle.interview_duration_minutes) : "",
            instructions: cycle.interview_instructions ?? "",
          },
    );
  }, [cycle, isWrittenTest]);

  const saveDefaultsMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admission/cycles/${cycleId}/stages/${stageType}/defaults`, {
        requires: defaults.requires,
        scheduled_date: defaults.scheduled_date || undefined,
        venue: defaults.venue || undefined,
        duration_minutes: defaults.duration_minutes ? Number(defaults.duration_minutes) : undefined,
        instructions: defaults.instructions || undefined,
      }),
    onSuccess: () => {
      toast.success(`${label} defaults saved`);
      queryClient.invalidateQueries({ queryKey: ["admission", "cycles", cycleId] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save"),
  });

  const [seatStatuses, setSeatStatuses] = useState<string[]>(["SHORTLISTED"]);
  const [halls, setHalls] = useState<{ name: string; capacity: string }[]>([{ name: "Hall A", capacity: "50" }]);
  const [startSeat, setStartSeat] = useState("1");
  const [selectedForNotify, setSelectedForNotify] = useState<string[]>([]);

  const { data: preview, refetch: refetchPreview } = useQuery<StagePreviewRow[]>({
    queryKey: ["admission", "cycles", cycleId, "stages", stageType, "status"],
    queryFn: async () => (await api.get(`/api/admission/cycles/${cycleId}/stages/${stageType}/status`)).data.data,
  });

  const bulkAssignMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/admission/cycles/${cycleId}/stages/${stageType}/bulk-assign`, {
        statuses: seatStatuses,
        halls: isWrittenTest ? halls.filter((h) => h.name && h.capacity).map((h) => ({ name: h.name, capacity: Number(h.capacity) })) : undefined,
        start_seat: Number(startSeat) || 1,
      }),
    onSuccess: (res) => {
      toast.success(`Assigned ${res.data.data.assigned} candidate(s)${res.data.data.overflow ? ` — ${res.data.data.overflow} could not be seated (over capacity)` : ""}`);
      refetchPreview();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to bulk-assign"),
  });

  const notifyMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/cycles/${cycleId}/stages/${stageType}/bulk-notify`, { application_ids: selectedForNotify }),
    onSuccess: (res) => {
      toast.success(`Notified ${res.data.data.notified} applicant(s)`);
      setSelectedForNotify([]);
      refetchPreview();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to notify"),
  });

  const outcomeMutation = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: "PASSED" | "FAILED" | "NO_SHOW" }) =>
      api.put(`/api/admission/applications/${applicationId}/stages/${stageType}/outcome`, { status }),
    onSuccess: () => {
      toast.success("Outcome recorded");
      refetchPreview();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record outcome"),
  });

  async function downloadAllCards() {
    const res = await api.get(`/api/admission/cycles/${cycleId}/stages/${stageType}/cards`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.replace(/\s+/g, "_")}_Cards.pdf`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">{label} Defaults</p>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={defaults.requires} onCheckedChange={(v) => setDefaults((f) => ({ ...f, requires: v }))} />
            This cycle requires {isWrittenTest ? "a written test" : "an interview"}
          </label>
          {defaults.requires && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Date &amp; Time</Label><Input type="datetime-local" value={defaults.scheduled_date} onChange={(e) => setDefaults((f) => ({ ...f, scheduled_date: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Duration (minutes)</Label><Input type="number" min={1} value={defaults.duration_minutes} onChange={(e) => setDefaults((f) => ({ ...f, duration_minutes: e.target.value }))} /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Venue</Label><Input value={defaults.venue} onChange={(e) => setDefaults((f) => ({ ...f, venue: e.target.value }))} placeholder="e.g. Main Campus, Room 101" /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Instructions</Label><Textarea value={defaults.instructions} onChange={(e) => setDefaults((f) => ({ ...f, instructions: e.target.value }))} placeholder="e.g. Bring admit card and photo ID." /></div>
            </div>
          )}
          <Button size="sm" onClick={() => saveDefaultsMutation.mutate()} disabled={saveDefaultsMutation.isPending}>Save Defaults</Button>
        </CardContent>
      </Card>

      {defaults.requires && (
        <>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="font-medium">Bulk Assign</p>
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
              {isWrittenTest && (
                <div className="space-y-2">
                  {halls.map((hall, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="w-48" placeholder="Hall name" value={hall.name} onChange={(e) => setHalls((prev) => prev.map((h, idx) => (idx === i ? { ...h, name: e.target.value } : h)))} />
                      <Input className="w-32" type="number" min={1} placeholder="Capacity" value={hall.capacity} onChange={(e) => setHalls((prev) => prev.map((h, idx) => (idx === i ? { ...h, capacity: e.target.value } : h)))} />
                      <Button size="sm" variant="outline" onClick={() => setHalls((prev) => prev.filter((_, idx) => idx !== i))} disabled={halls.length === 1}>Remove</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setHalls((prev) => [...prev, { name: "", capacity: "" }])}>+ Add Hall</Button>
                  <div className="w-32 space-y-1.5"><Label className="text-xs">Start Seat #</Label><Input type="number" min={1} value={startSeat} onChange={(e) => setStartSeat(e.target.value)} /></div>
                </div>
              )}
              <Button size="sm" onClick={() => bulkAssignMutation.mutate()} disabled={bulkAssignMutation.isPending || !seatStatuses.length}>
                Assign {label}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-medium">Roster &amp; Notify</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={downloadAllCards}>Download All Cards</Button>
                  <Button size="sm" onClick={() => notifyMutation.mutate()} disabled={notifyMutation.isPending || !selectedForNotify.length}>
                    Notify Selected ({selectedForNotify.length})
                  </Button>
                </div>
              </div>
              {!preview?.length && <EmptyState title="No shortlisted/waitlisted applicants yet" />}
              {!!preview?.length && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Status</TableHead>
                      {isWrittenTest && <TableHead>Hall / Seat</TableHead>}
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Notified</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedForNotify.includes(row.id)}
                            disabled={!row.stage}
                            onCheckedChange={(v) => setSelectedForNotify((prev) => (v ? [...prev, row.id] : prev.filter((x) => x !== row.id)))}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.admission_roll ?? "-"}</TableCell>
                        <TableCell><Link href={`/admission/applications/${row.id}`} className="text-primary hover:underline">{row.applicant_name}</Link></TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                        {isWrittenTest && <TableCell className="text-xs">{row.stage?.hall_name ? `${row.stage.hall_name} / ${row.stage.seat_number}` : "-"}</TableCell>}
                        <TableCell className="text-xs">{row.stage?.scheduled_date ? new Date(row.stage.scheduled_date).toLocaleString() : "-"}</TableCell>
                        <TableCell>{row.stage?.notified_at ? <span className="text-xs text-emerald-600">Yes</span> : <span className="text-xs text-muted-foreground">No</span>}</TableCell>
                        <TableCell>
                          {row.stage ? (
                            <select
                              className="rounded-md border px-2 py-1 text-xs"
                              value={row.stage.status}
                              onChange={(e) => outcomeMutation.mutate({ applicationId: row.id, status: e.target.value as "PASSED" | "FAILED" | "NO_SHOW" })}
                            >
                              <option value="SCHEDULED">Scheduled</option>
                              <option value="PASSED">Passed</option>
                              <option value="FAILED">Failed</option>
                              <option value="NO_SHOW">No Show</option>
                            </select>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
