"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ReconciliationRun {
  id: string;
  run_at: string;
  trigger: "SCHEDULED" | "MANUAL";
  academic_year_id: string;
  coverage_gap_count: number;
  unexpected_invoice_count: number;
  assignment_gap_count: number;
  amount_variance_count: number;
}

interface Finding {
  id: string;
  type: "COVERAGE_GAP" | "UNEXPECTED_INVOICE" | "ASSIGNMENT_GAP" | "AMOUNT_VARIANCE";
  description: string;
  status: "OPEN" | "DISMISSED" | "RESOLVED";
  expected_amount: number | null;
  actual_amount: number | null;
  created_at: string;
  review_note: string | null;
  student: { name_en: string; student_uid: string } | null;
  fee_structure: { name: string } | null;
  class: { name_en: string } | null;
  section: { name: string } | null;
  group: { name_en: string } | null;
}

interface StructureCoverageSummary {
  id: string;
  fee_structure_id: string;
  structure_name: string;
  category: string;
  frequency: string;
  assignment_summary: string;
  expected_count: number;
  invoiced_count: number;
}

interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}

const TYPE_LABEL: Record<Finding["type"], string> = {
  COVERAGE_GAP: "Missing Invoice",
  UNEXPECTED_INVOICE: "Unexpected Invoice",
  ASSIGNMENT_GAP: "Possible Forgotten Assignment",
  AMOUNT_VARIANCE: "Amount Mismatch",
};
const TYPE_VARIANT: Record<Finding["type"], "destructive" | "outline" | "secondary"> = {
  COVERAGE_GAP: "destructive",
  UNEXPECTED_INVOICE: "secondary",
  ASSIGNMENT_GAP: "outline",
  AMOUNT_VARIANCE: "destructive",
};
const TYPE_EXPLAINER: Record<Finding["type"], string> = {
  COVERAGE_GAP:
    "The fee IS correctly assigned to this student's class/group — that's exactly why they're on this list. Invoices for it were just never generated. Fix: go to Fee Structures and click \"Generate Invoices Now\" for the structure named in each row below.",
  UNEXPECTED_INVOICE:
    "An invoice exists for this fee, but the student no longer matches the structure's class/section/group rules — most often because they were promoted/moved after the invoice was created. Usually not an error, just worth a glance.",
  ASSIGNMENT_GAP:
    "Most of this student's classmates have this specific fee individually assigned (a one-off charge like a makeup-exam fee) and this student doesn't. Could be intentional (an exemption) or a forgotten assignment — review and decide.",
  AMOUNT_VARIANCE:
    "This invoice's due amount doesn't match what the fee structure (minus any waiver/manual discount) should produce. Could be a genuine data-entry slip, or a legitimate adjustment this check doesn't yet know how to account for.",
};
const STATUS_VARIANT: Record<Finding["status"], "outline" | "secondary" | "default"> = { OPEN: "outline", DISMISSED: "secondary", RESOLVED: "default" };

export default function FeeAssurancePage() {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{ finding: Finding; status: "DISMISSED" | "RESOLVED" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classFilter);

  const { data: runs, isLoading: runsLoading, isError: runsError, error: runsErrorObj, refetch: refetchRuns } = useQuery<ReconciliationRun[]>({
    queryKey: ["fee-reconciliation", "runs"],
    queryFn: async () => (await api.get("/api/fees/reconciliation/runs", { params: { limit: 20 } })).data.data,
  });

  const latestRun = runs?.[0];
  const activeRunId = selectedRunId ?? latestRun?.id ?? null;

  const {
    data: runDetail,
    isLoading: findingsLoading,
    isError: findingsError,
    error: findingsErrorObj,
    refetch: refetchFindings,
  } = useQuery<{ run: ReconciliationRun; findings: Finding[]; structureSummaries: StructureCoverageSummary[] }>({
    queryKey: ["fee-reconciliation", "run", activeRunId, typeFilter, statusFilter, classFilter, sectionFilter, groupFilter],
    queryFn: async () =>
      (
        await api.get(`/api/fees/reconciliation/runs/${activeRunId}`, {
          params: {
            type: typeFilter || undefined,
            status: statusFilter || undefined,
            class_id: classFilter || undefined,
            section_id: sectionFilter || undefined,
            group_id: groupFilter || undefined,
          },
        })
      ).data.data,
    enabled: !!activeRunId,
  });

  const runNowMutation = useMutation({
    mutationFn: () => api.post("/api/fees/reconciliation/run-now"),
    onSuccess: (res) => {
      toast.success(`Sweep complete — ${res.data.data.totalFindings} item(s) found`);
      setSelectedRunId(res.data.data.runId);
      queryClient.invalidateQueries({ queryKey: ["fee-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["analytics", "pending-counts"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to run reconciliation sweep"),
  });

  const reviewMutation = useMutation({
    mutationFn: () => api.put(`/api/fees/reconciliation/findings/${reviewTarget!.finding.id}/review`, { status: reviewTarget!.status, note: reviewNote }),
    onSuccess: () => {
      toast.success(reviewTarget?.status === "RESOLVED" ? "Marked resolved" : "Dismissed");
      queryClient.invalidateQueries({ queryKey: ["fee-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["analytics", "pending-counts"] });
      setReviewTarget(null);
      setReviewNote("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update finding"),
  });

  const tiles = runDetail?.run ?? latestRun;

  return (
    <PageWrapper>
      <PageHeader
        title="Fee Assurance"
        subtitle="Nightly sweep comparing who should be billed against who actually is — every item here is a suggestion to review, nothing is auto-fixed"
        breadcrumbs={[{ label: "Fee Assurance" }]}
        action={
          <Button onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending}>
            {runNowMutation.isPending ? "Running…" : "Run Now"}
          </Button>
        }
      />

      {runsLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : runsError ? (
        <ErrorState title="Failed to load reconciliation runs" description={extractErrorMessage(runsErrorObj)} retryLabel="Retry" onRetry={() => refetchRuns()} />
      ) : !runs?.length ? (
        <EmptyState title="No sweeps have run yet" description="Click Run Now to check fee coverage, assignments, and amounts for the first time." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Missing Invoices</p>
                <p className="text-2xl font-semibold">{tiles?.coverage_gap_count ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Unexpected Invoices</p>
                <p className="text-2xl font-semibold">{tiles?.unexpected_invoice_count ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Possible Forgotten Assignments</p>
                <p className="text-2xl font-semibold">{tiles?.assignment_gap_count ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Amount Mismatches</p>
                <p className="text-2xl font-semibold">{tiles?.amount_variance_count ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Fee Structure Coverage -- "which class/group is this fee assigned
              to, and how many of those students are actually invoiced." The
              direct answer to "is Missing Invoice happening because the class
              wasn't assigned the fee, or something else": scroll this table
              for the structure named in a Missing Invoice row and read its
              Assigned To column -- that assignment is *why* the student shows
              up as expected in the first place. */}
          {!!runDetail?.structureSummaries.length && (
            <Card>
              <CardContent className="p-0">
                <div className="space-y-2 border-b px-4 py-3">
                  <p className="text-sm font-semibold">Fee Structure Coverage</p>
                  <p className="text-xs text-muted-foreground">Which class/group each active fee is assigned to, and how many of those students are actually invoiced</p>
                  <div className="grid gap-x-6 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <p><span className="font-semibold text-foreground">Expected</span> — how many students this fee is currently assigned to (via its Class/Group/individual assignment right now).</p>
                    <p><span className="font-semibold text-foreground">Invoiced</span> — how many of them actually have a real invoice for this fee.</p>
                    <p><Badge variant="destructive" className="mr-1 align-middle">Coverage &lt; 100%</Badge>Some assigned students have no invoice yet. Fix: Fee Structures → this fee → <span className="font-medium text-foreground">Generate Invoices Now</span>.</p>
                    <p><Badge variant="secondary" className="mr-1 align-middle">Coverage &gt; 100%</Badge>More invoices exist than the fee is <em>currently</em> assigned to — the assignment was narrowed after invoicing. If that was intentional, nothing to do; if not, add the missing class/group back under Assign to Classes.</p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Invoiced</TableHead>
                      <TableHead className="text-right">Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runDetail.structureSummaries.map((s) => {
                      const pct = s.expected_count > 0 ? Math.round((s.invoiced_count / s.expected_count) * 100) : 100;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm font-medium">{s.structure_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.category} · {s.frequency}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.assignment_summary}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{s.expected_count}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{s.invoiced_count}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={pct === 100 ? "default" : pct < 100 ? "destructive" : "secondary"}>{pct}%</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Select value={activeRunId ?? ""} onValueChange={(v) => setSelectedRunId(v)}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select a run" /></SelectTrigger>
              <SelectContent>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {new Date(r.run_at).toLocaleString()} — {r.trigger === "SCHEDULED" ? "Scheduled" : "Manual"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(Object.keys(TYPE_LABEL) as Finding["type"][]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="DISMISSED">Dismissed</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={classFilter || "all"}
              onValueChange={(v) => { setClassFilter(v === "all" ? "" : v); setSectionFilter(""); setGroupFilter(""); }}
            >
              <SelectTrigger className="w-44"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>

            {!!selectedClass?.sections?.length && (
              <Select value={sectionFilter || "all"} onValueChange={(v) => setSectionFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Sections" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {selectedClass.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {!!selectedClass?.groups?.length && (
              <Select value={groupFilter || "all"} onValueChange={(v) => setGroupFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Groups" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {selectedClass.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {typeFilter && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold">{TYPE_LABEL[typeFilter as Finding["type"]]}: </span>
              {TYPE_EXPLAINER[typeFilter as Finding["type"]]}
            </p>
          )}

          {findingsLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : findingsError ? (
            <ErrorState title="Failed to load findings" description={extractErrorMessage(findingsErrorObj)} retryLabel="Retry" onRetry={() => refetchFindings()} />
          ) : !runDetail?.findings.length ? (
            <EmptyState title="Nothing here" description="No findings match the current filters." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Class / Section / Group</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runDetail.findings.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell><Badge variant={TYPE_VARIANT[f.type]}>{TYPE_LABEL[f.type]}</Badge></TableCell>
                        <TableCell className="max-w-md text-sm">
                          {f.description}
                          {f.review_note && <p className="mt-1 text-xs text-muted-foreground">Note: {f.review_note}</p>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {f.class?.name_en ?? "—"}
                          {f.section && ` · ${f.section.name}`}
                          {f.group && ` · ${f.group.name_en}`}
                        </TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge></TableCell>
                        <TableCell className="text-right space-x-2">
                          {f.status === "OPEN" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setReviewTarget({ finding: f, status: "RESOLVED" })}>Mark Resolved</Button>
                              <Button size="sm" variant="ghost" onClick={() => setReviewTarget({ finding: f, status: "DISMISSED" })}>Dismiss</Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={!!reviewTarget} onOpenChange={(o) => { if (!o) { setReviewTarget(null); setReviewNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewTarget?.status === "RESOLVED" ? "Mark Resolved" : "Dismiss Finding"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {reviewTarget && <p className="text-sm text-muted-foreground">{reviewTarget.finding.description}</p>}
            <Textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={reviewTarget?.status === "RESOLVED" ? "What was fixed?" : "Why is this OK as-is?"}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending || !reviewNote.trim()}>
              {reviewMutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
