"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, Textarea, Input, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface InvoicePayment {
  id: string;
  gateway: string;
  amount: number;
  status: string;
  receipt_no: string | null;
  paid_at: string | null;
}
interface Invoice {
  id: string;
  category: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  status: string;
  payments: InvoicePayment[];
}

interface Stage {
  id: string;
  stage_type: "WRITTEN_TEST" | "INTERVIEW";
  scheduled_date: string | null;
  venue: string | null;
  duration_minutes: number | null;
  instructions: string | null;
  hall_name: string | null;
  seat_number: string | null;
  status: "SCHEDULED" | "PASSED" | "FAILED" | "NO_SHOW";
  notified_at: string | null;
}

interface Application {
  id: string;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
  merit_rank: number | null;
  notes: string | null;
  guardian_info: { father_name?: string; mother_name?: string; phone: string; email?: string; address?: string };
  personal_info: Record<string, unknown>;
  previous_result: {
    institution?: string;
    class_passed?: string;
    gpa?: number;
    gpa_scale?: "5" | "4" | "OTHER";
    marks_obtained?: number;
    marks_total_out_of?: number;
    total_marks?: number; // legacy field from applications submitted before gpa_scale/marks_total_out_of existed
  } | null;
  selected_subjects: string[] | null;
  documents: Record<string, string> | null;
  photo_url: string | null;
  documents_uploaded: { id: string; doc_type: string; slot: string | null; original_filename: string; url: string }[];
  enrolled_student_id: string | null;
  cycle: { id: string; name: string; class_id: string };
  invoices: Invoice[];
  payment_status: "NOT_REQUIRED" | "DUE" | "PARTIAL" | "PENDING_VERIFICATION" | "PAID";
  stages: Stage[];
}

const STAGE_LABEL: Record<Stage["stage_type"], string> = { WRITTEN_TEST: "Written Test", INTERVIEW: "Interview" };

// One stage's own schedule/override/outcome row -- kept as a nested
// component since it carries local edit-form state independent of the
// other stage type (Plan Twenty-Three, Phase 5).
function StageRow({ applicationId, stageType, stage }: { applicationId: string; stageType: Stage["stage_type"]; stage: Stage | undefined }) {
  const queryClient = useQueryClient();
  const isWrittenTest = stageType === "WRITTEN_TEST";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ scheduled_date: "", venue: "", hall_name: "", seat_number: "" });

  useEffect(() => {
    setForm({
      scheduled_date: stage?.scheduled_date ? stage.scheduled_date.slice(0, 16) : "",
      venue: stage?.venue ?? "",
      hall_name: stage?.hall_name ?? "",
      seat_number: stage?.seat_number ?? "",
    });
  }, [stage]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admission/applications/${applicationId}/stages/${stageType}`, {
        scheduled_date: form.scheduled_date || null,
        venue: form.venue || null,
        hall_name: isWrittenTest ? form.hall_name || null : undefined,
        seat_number: isWrittenTest ? form.seat_number || null : undefined,
      }),
    onSuccess: () => {
      toast.success(`${STAGE_LABEL[stageType]} schedule saved`);
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", applicationId] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save"),
  });

  const outcomeMutation = useMutation({
    mutationFn: (status: "PASSED" | "FAILED" | "NO_SHOW") => api.put(`/api/admission/applications/${applicationId}/stages/${stageType}/outcome`, { status }),
    onSuccess: () => {
      toast.success("Outcome recorded");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", applicationId] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record outcome"),
  });

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{STAGE_LABEL[stageType]}</p>
        {stage && (
          <div className="flex items-center gap-2">
            {stage.notified_at ? (
              <span className="text-xs text-emerald-600">Notified {new Date(stage.notified_at).toLocaleDateString()}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Not yet notified</span>
            )}
            <a href={`/api/admission/applications/${applicationId}/stages/${stageType}/card`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              Download Card
            </a>
          </div>
        )}
      </div>

      {!stage && !editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Schedule</Button>}

      {(stage || editing) && (
        editing ? (
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" value={form.scheduled_date} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} className="h-8 text-xs" />
            <Input placeholder="Venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} className="h-8 text-xs" />
            {isWrittenTest && (
              <>
                <Input placeholder="Hall" value={form.hall_name} onChange={(e) => setForm((f) => ({ ...f, hall_name: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Seat No" value={form.seat_number} onChange={(e) => setForm((f) => ({ ...f, seat_number: e.target.value }))} className="h-8 text-xs" />
              </>
            )}
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          stage && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{stage.scheduled_date ? new Date(stage.scheduled_date).toLocaleString() : "No date set"} {stage.venue ? `— ${stage.venue}` : ""}</p>
              {isWrittenTest && stage.hall_name && <p>Hall {stage.hall_name}, Seat {stage.seat_number}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                <select
                  className="rounded-md border px-2 py-1 text-xs"
                  value={stage.status}
                  onChange={(e) => outcomeMutation.mutate(e.target.value as "PASSED" | "FAILED" | "NO_SHOW")}
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="PASSED">Passed</option>
                  <option value="FAILED">Failed</option>
                  <option value="NO_SHOW">No Show</option>
                </select>
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}

const PAYMENT_STATUS_LABEL: Record<Application["payment_status"], string> = {
  NOT_REQUIRED: "No payment required",
  DUE: "Payment Due",
  PARTIAL: "Partially Paid",
  PENDING_VERIFICATION: "Awaiting Verification",
  PAID: "Paid",
};
const PAYMENT_STATUS_CLASS: Record<Application["payment_status"], string> = {
  NOT_REQUIRED: "bg-muted text-muted-foreground",
  DUE: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  PENDING_VERIFICATION: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
};

// One invoice's own collect-cash row -- kept as a nested component since it
// carries local form state (amount/gateway) independent of every other
// invoice on the application.
function InvoiceRow({ invoice, applicationId }: { invoice: Invoice; applicationId: string }) {
  const queryClient = useQueryClient();
  const outstanding = Math.max(0, invoice.amount_due + invoice.fine_amount - invoice.amount_paid);
  const settled = invoice.status === "PAID" || invoice.status === "WAIVED";
  const [collecting, setCollecting] = useState(false);
  const [amount, setAmount] = useState(String(outstanding));

  const collectMutation = useMutation({
    mutationFn: () => api.post("/api/fees/collect", { invoice_id: invoice.id, amount: Number(amount), gateway: "CASH" }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setCollecting(false);
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", applicationId] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record payment"),
  });

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{invoice.description}</p>
          <p className="text-xs text-muted-foreground">{invoice.category} · Due ৳{outstanding}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${settled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{invoice.status}</span>
      </div>

      {invoice.payments.length > 0 && (
        <div className="space-y-1">
          {invoice.payments.map((p) => (
            <p key={p.id} className="text-xs text-muted-foreground">
              {p.gateway} — ৳{p.amount} — {p.status}{p.receipt_no ? ` — Receipt ${p.receipt_no}` : ""}
            </p>
          ))}
        </div>
      )}

      {!settled && (
        collecting ? (
          <div className="flex items-center gap-2">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 w-28 text-xs" />
            <Button size="sm" onClick={() => collectMutation.mutate()} disabled={collectMutation.isPending}>
              {collectMutation.isPending ? "Recording..." : "Confirm"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCollecting(false)}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCollecting(true)}>Collect Cash</Button>
        )
      )}
    </div>
  );
}

export default function AdmissionApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: app, isLoading, isError, error, refetch } = useQuery<Application>({ queryKey: ["admission", "applications", "detail", id], queryFn: async () => (await api.get(`/api/admission/applications/${id}`)).data.data });

  const [notesDraft, setNotesDraft] = useState("");
  useEffect(() => { setNotesDraft(app?.notes ?? ""); }, [app?.notes]);

  const notesMutation = useMutation({
    mutationFn: () => api.put(`/api/admission/applications/${id}/notes`, { notes: notesDraft }),
    onSuccess: () => {
      toast.success("Notes saved");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save notes"),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "SHORTLISTED" | "WAITLISTED" | "REJECTED") => api.put(`/api/admission/applications/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update application status"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/applications/${id}/confirm`),
    onSuccess: () => {
      toast.success("Application confirmed");
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Could not confirm this application"),
  });

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/api/admission/applications/${id}/enroll`, {}),
    onSuccess: (res) => {
      const loginWarnings: string[] | undefined = res.data.login_warnings;
      if (loginWarnings?.length) {
        for (const warning of loginWarnings) toast(warning, { duration: 15000 });
      }
      toast.success(`Enrolled as ${res.data.data.student_uid}`);
      queryClient.invalidateQueries({ queryKey: ["admission", "applications", "detail", id] });
      router.push(`/students/${res.data.data.id}`);
    },
    onError: () => toast.error("Only confirmed applications can be enrolled"),
  });

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      </PageWrapper>
    );
  }

  if (isError || !app) {
    return (
      <PageWrapper>
        <ErrorState title="Failed to load application" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title={app.applicant_name}
        breadcrumbs={[{ label: "Admission", href: "/admission" }, { label: app.cycle.name, href: `/admission/cycles/${app.cycle.id}` }, { label: app.applicant_name }]}
        action={
          <div className="flex gap-2">
            {app.status === "PENDING" && (
              <>
                <Button variant="outline" onClick={() => statusMutation.mutate("SHORTLISTED")}>Shortlist</Button>
                <Button variant="outline" onClick={() => statusMutation.mutate("WAITLISTED")}>Waitlist</Button>
                <Button variant="destructive" onClick={() => statusMutation.mutate("REJECTED")}>Reject</Button>
              </>
            )}
            {/* WAITLISTED can now confirm directly too -- previously needed
                a separate SHORTLISTED detour first (Plan Twenty-Three, Phase 1). */}
            {(app.status === "SHORTLISTED" || app.status === "WAITLISTED") && (
              <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>Confirm Seat</Button>
            )}
            {app.status === "CONFIRMED" && <Button onClick={() => enrollMutation.mutate()} disabled={enrollMutation.isPending}>Enroll Student</Button>}
          </div>
        }
      />

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- external/local blob URL, not a static asset */}
        {app.photo_url && <img src={app.photo_url} alt={app.applicant_name} className="h-12 w-12 rounded-full object-cover border" />}
        <StatusBadge status={app.status} />
        {app.payment_status !== "NOT_REQUIRED" && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_CLASS[app.payment_status]}`}>{PAYMENT_STATUS_LABEL[app.payment_status]}</span>
        )}
        {app.admission_roll && <span className="font-mono text-sm text-muted-foreground">{app.admission_roll}</span>}
        {app.merit_rank && <span className="text-sm text-muted-foreground">Merit Rank #{app.merit_rank}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Guardian Info</p>
            <p className="text-sm">Father: {app.guardian_info.father_name ?? "-"}</p>
            <p className="text-sm">Mother: {app.guardian_info.mother_name ?? "-"}</p>
            <p className="text-sm">Phone: {app.guardian_info.phone}</p>
            <p className="text-sm">Email: {app.guardian_info.email ?? "-"}</p>
            <p className="text-sm">Address: {app.guardian_info.address ?? "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Previous Academic Record</p>
            <p className="text-sm">Institution: {app.previous_result?.institution ?? "-"}</p>
            <p className="text-sm">Class Passed: {app.previous_result?.class_passed ?? "-"}</p>
            <p className="text-sm">GPA: {app.previous_result?.gpa != null ? `${app.previous_result.gpa} (out of ${app.previous_result.gpa_scale ?? "5"})` : "-"}</p>
            <p className="text-sm">
              Total Marks:{" "}
              {app.previous_result?.marks_obtained != null
                ? `${app.previous_result.marks_obtained}${app.previous_result.marks_total_out_of ? ` / ${app.previous_result.marks_total_out_of}` : ""}`
                : (app.previous_result?.total_marks ?? "-")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Personal Info</p>
            {Object.entries(app.personal_info ?? {}).map(([k, v]) => (
              <p key={k} className="text-sm"><span className="text-muted-foreground">{k}:</span> {String(v)}</p>
            ))}
          </CardContent>
        </Card>

        {app.invoices.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="font-medium">Payment</p>
              <div className="space-y-2">
                {app.invoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} applicationId={String(id)} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Assessment / Scheduling</p>
            <div className="space-y-2">
              <StageRow applicationId={String(id)} stageType="WRITTEN_TEST" stage={app.stages.find((s) => s.stage_type === "WRITTEN_TEST")} />
              <StageRow applicationId={String(id)} stageType="INTERVIEW" stage={app.stages.find((s) => s.stage_type === "INTERVIEW")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Documents</p>
            {/* Real StudentDocument rows (Plan Twenty-Three, Phase 2), each
                a signed short-lived URL resolved server-side -- falls back
                to the legacy raw Json map only for applications submitted
                before this phase, which have no documents_uploaded rows. */}
            {app.documents_uploaded.length ? (
              app.documents_uploaded.map((d) => (
                <p key={d.id} className="text-sm">
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {d.doc_type.replace(/_/g, " ")}{d.slot ? ` (${d.slot})` : ""}
                  </a>
                  <span className="text-xs text-muted-foreground ml-2">{d.original_filename}</span>
                </p>
              ))
            ) : app.documents && Object.keys(app.documents).length ? (
              Object.entries(app.documents).map(([k, url]) => (
                <p key={k} className="text-sm"><a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{k}</a> <span className="text-xs text-muted-foreground">(legacy)</span></p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No documents uploaded</p>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">Internal Notes</p>
            <p className="text-xs text-muted-foreground">Staff-only — never shown to the applicant.</p>
            <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} placeholder="e.g. Called guardian on 12/08, confirmed intent to enroll." />
            <Button size="sm" onClick={() => notesMutation.mutate()} disabled={notesMutation.isPending || notesDraft === (app.notes ?? "")}>
              {notesMutation.isPending ? "Saving..." : "Save Notes"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
