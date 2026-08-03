"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AdjustmentNote, Badge, Button, Card, CardContent, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, ErrorState, Input, Label,
  LoadingSpinner, PageHeader, PageWrapper, SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, Switch,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const GATEWAYS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "BKASH", label: "bKash (manual)" },
  { value: "NAGAD", label: "Nagad (manual)" },
  { value: "ROCKET", label: "Rocket (manual)" },
];
const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];
const FREQUENCIES = [
  { value: "ONE_TIME", label: "One-Time" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];
const STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "WAIVED", label: "Waived" },
];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CURRENT_YEAR = new Date().getFullYear();

interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}
interface YearOption { id: string; label: string; is_active: boolean }
interface SubCategoryOption { id: string; category: string; name: string }
interface StudentBasic { id: string; name_en: string; student_uid: string }

interface DashboardSummary {
  total_students: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_percentage: number;
  overdue_count: number;
  overdue_amount: number;
  fully_paid_count: number;
  with_dues_count: number;
}
interface StructureRow {
  fee_structure_id: string | null;
  name: string;
  category: string;
  sub_category: string | null;
  frequency: string | null;
  invoice_count: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_percentage: number;
}
interface FinancialContext {
  total_revenue: number;
  total_expense: number;
  net_position: number;
  salary_paid: number;
  current_fund_balance: number;
}
interface DashboardResponse {
  academic_year: { id: string; label: string } | null;
  period_label: string;
  summary: DashboardSummary;
  by_structure: StructureRow[];
  financial_context: FinancialContext;
}
interface DrillDownRow {
  id: string;
  student: { id: string; name_en: string; student_uid: string; class_name: string | null; section_name: string | null } | null;
  description: string;
  category: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  outstanding: number;
  status: string;
  due_date: string;
}

function money(n: number) {
  return `৳${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const emptyFilters = {
  academicYearId: "", month: "", classId: "", sectionId: "", groupId: "", category: "", feeSubCategoryId: "", frequency: "", status: "",
};

export default function CollectFeePage() {
  const searchParams = useSearchParams();
  const directStudentId = searchParams.get("student_id");

  const [filters, setFilters] = useState(emptyFilters);
  const [collectingStudent, setCollectingStudent] = useState<StudentBasic | null>(null);
  const [drillDown, setDrillDown] = useState<{ open: boolean; feeStructureId: string | null; label: string }>({ open: false, feeStructureId: null, label: "" });
  const [drillSearch, setDrillSearch] = useState("");
  const [drillPage, setDrillPage] = useState(1);

  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: subCategories } = useQuery<SubCategoryOption[]>({ queryKey: ["fees", "sub-categories"], queryFn: async () => (await api.get("/api/fees/sub-categories", { params: { active_only: "true" } })).data.data });
  const selectedClass = classes?.find((c) => c.id === filters.classId);
  const relevantSubCategories = subCategories?.filter((s) => !filters.category || s.category === filters.category) ?? [];

  const dashboardParams = {
    academic_year_id: filters.academicYearId || undefined,
    month: filters.month || undefined,
    year: filters.month ? CURRENT_YEAR : undefined,
    class_id: filters.classId || undefined,
    section_id: filters.sectionId || undefined,
    group_id: filters.groupId || undefined,
    category: filters.category || undefined,
    fee_sub_category_id: filters.feeSubCategoryId || undefined,
    frequency: filters.frequency || undefined,
    status: filters.status || undefined,
  };

  const { data: dashboard, isLoading: dashboardLoading, isError: dashboardError, error: dashboardErrorObj, refetch: refetchDashboard } = useQuery<DashboardResponse>({
    queryKey: ["fees", "collection-dashboard", dashboardParams],
    queryFn: async () => (await api.get("/api/fees/collection-dashboard", { params: dashboardParams })).data.data,
  });

  const { data: drillData, isFetching: drillLoading } = useQuery<{ data: DrillDownRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ["fees", "collection-dashboard", "invoices", dashboardParams, drillDown.feeStructureId, drillSearch, drillPage],
    queryFn: async () =>
      (
        await api.get("/api/fees/collection-dashboard/invoices", {
          params: { ...dashboardParams, fee_structure_id: drillDown.feeStructureId ?? undefined, search: drillSearch || undefined, page: drillPage, limit: 50 },
        })
      ).data,
    enabled: drillDown.open,
  });

  const { data: directStudent } = useQuery<{ personal: { id: string; name_en: string; student_uid: string } }>({
    queryKey: ["students", directStudentId],
    queryFn: async () => (await api.get(`/api/students/${directStudentId}`)).data.data,
    enabled: !!directStudentId,
  });
  useEffect(() => {
    if (directStudent) setCollectingStudent({ id: directStudent.personal.id, name_en: directStudent.personal.name_en, student_uid: directStudent.personal.student_uid });
  }, [directStudent]);

  function setFilter<K extends keyof typeof filters>(key: K, value: string) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "classId") { next.sectionId = ""; next.groupId = ""; }
      if (key === "category") next.feeSubCategoryId = "";
      return next;
    });
  }

  function openDrillDown(feeStructureId: string | null, label: string) {
    setDrillDown({ open: true, feeStructureId, label });
    setDrillSearch("");
    setDrillPage(1);
  }

  const s = dashboard?.summary;
  const fc = dashboard?.financial_context;

  return (
    <PageWrapper>
      <PageHeader
        title="Collect Fee"
        subtitle="Full collection picture first — filter to narrow it, then collect from any student."
        breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Collect" }]}
      />

      {/* ── Filters — every one of these recomputes the whole dashboard below, not just a table ── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Session</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.academicYearId} onChange={(e) => setFilter("academicYearId", e.target.value)}>
              <option value="">Active session</option>
              {years?.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? " (Active)" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.month} onChange={(e) => setFilter("month", e.target.value)}>
              <option value="">Whole session</option>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m} {CURRENT_YEAR}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.classId} onChange={(e) => setFilter("classId", e.target.value)}>
              <option value="">All classes</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Section</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.sectionId} onChange={(e) => setFilter("sectionId", e.target.value)} disabled={!filters.classId}>
              <option value="">All sections</option>
              {selectedClass?.sections?.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
            </select>
          </div>
          {!!selectedClass?.groups?.length && (
            <div className="space-y-1">
              <Label className="text-xs">Group</Label>
              <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.groupId} onChange={(e) => setFilter("groupId", e.target.value)}>
                <option value="">All groups</option>
                {selectedClass.groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!!relevantSubCategories.length && (
            <div className="space-y-1">
              <Label className="text-xs">Sub-Category</Label>
              <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.feeSubCategoryId} onChange={(e) => setFilter("feeSubCategoryId", e.target.value)}>
                <option value="">All</option>
                {relevantSubCategories.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Fee Type</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.frequency} onChange={(e) => setFilter("frequency", e.target.value)}>
              <option value="">All types</option>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <select className="rounded-md border px-2 py-1.5 text-sm" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
            </select>
          </div>
          {JSON.stringify(filters) !== JSON.stringify(emptyFilters) && (
            <Button size="sm" variant="outline" onClick={() => setFilters(emptyFilters)}>Clear filters</Button>
          )}
        </CardContent>
      </Card>

      {dashboardLoading && !dashboard && <div className="flex justify-center py-16"><LoadingSpinner /></div>}
      {dashboardError && <ErrorState title="Failed to load dashboard" description={extractErrorMessage(dashboardErrorObj)} retryLabel="Retry" onRetry={() => refetchDashboard()} />}

      {dashboard && s && (
        <>
          <p className="text-sm text-muted-foreground">
            Showing: <span className="font-medium text-foreground">{dashboard.academic_year?.label ?? "—"}</span> · {dashboard.period_label}
          </p>

          {/* ── Dynamic KPI cards — recompute for whatever filters are active above ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Students in scope</p><p className="text-xl font-semibold">{s.total_students}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Invoiced</p><p className="text-xl font-semibold">{money(s.total_invoiced)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Collected</p><p className="text-xl font-semibold text-emerald-600">{money(s.total_collected)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-xl font-semibold text-red-600">{money(s.total_outstanding)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Collection %</p><p className="text-xl font-semibold">{s.collection_percentage}%</p></CardContent></Card>
            <Card className="border-red-200">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="text-xl font-semibold text-red-600">{s.overdue_count} · {money(s.overdue_amount)}</p>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">{s.with_dues_count} student(s) with dues · {s.fully_paid_count} fully paid, for this exact filter selection.</p>

          {/* ── Financial context strip — same period, whole-institution picture, so a fee number is never seen in isolation ── */}
          {fc && (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-3 text-sm font-medium">Financial Context — {dashboard.period_label}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="font-semibold text-emerald-600">{money(fc.total_revenue)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total Expense</p><p className="font-semibold text-red-600">{money(fc.total_expense)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Net Position</p><p className={`font-semibold ${fc.net_position >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(fc.net_position)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Staff Salary Paid</p><p className="font-semibold">{money(fc.salary_paid)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Current Fund Balance</p><p className="font-semibold">{money(fc.current_fund_balance)}</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Quick actions — every audit-relevant destination one click away ── */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openDrillDown(null, "All matching invoices")}>View Due/Paid List</Button>
            <Link href="/fees/reports"><Button size="sm" variant="outline">Defaulters Report</Button></Link>
            <Link href="/fees/structures"><Button size="sm" variant="outline">Generate Invoices</Button></Link>
            <Link href="/fees/invoices"><Button size="sm" variant="outline">Bulk Monthly Invoice</Button></Link>
            <Link href="/fees/reports"><Button size="sm" variant="outline">Export / Audit Report</Button></Link>
            <Link href="/fees/waivers"><Button size="sm" variant="outline">Waiver Setup</Button></Link>
          </div>

          {/* ── Per-fee-structure breakdown ── */}
          <Card>
            <CardContent className="p-0">
              {!dashboard.by_structure.length ? (
                <EmptyState title="No invoices match this filter" description="Try widening the filters above, or generate invoices from Fee Structures." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee Structure</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Invoices</TableHead>
                      <TableHead>Invoiced</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.by_structure.map((row) => (
                      <TableRow key={row.fee_structure_id ?? row.name}>
                        <TableCell>
                          <p className="font-medium">{row.name}</p>
                          {row.sub_category && <p className="text-xs text-muted-foreground">{row.sub_category}</p>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{row.category}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{row.frequency ?? "—"}</TableCell>
                        <TableCell>{row.invoice_count}</TableCell>
                        <TableCell>{money(row.total_invoiced)}</TableCell>
                        <TableCell className="text-emerald-600">{money(row.total_collected)}</TableCell>
                        <TableCell className="text-red-600">{money(row.total_outstanding)}</TableCell>
                        <TableCell>{row.collection_percentage}%</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openDrillDown(row.fee_structure_id, row.name)}>View who owes/paid</Button>
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

      <CollectDialog student={collectingStudent} onClose={() => setCollectingStudent(null)} />

      {/* ── Drill-down: who owes, who's paid, for the current filters (and optionally one structure) ── */}
      <Dialog open={drillDown.open} onOpenChange={(v) => !v && setDrillDown({ open: false, feeStructureId: null, label: "" })}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{drillDown.label}</DialogTitle></DialogHeader>
          <SearchInput placeholder="Search by name or ID..." value={drillSearch} onChange={(e) => { setDrillSearch(e.target.value); setDrillPage(1); }} className="max-w-xs" />
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            {drillLoading && !drillData && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
            {!drillLoading && !drillData?.data.length && <EmptyState title="No matching invoices" />}
            {!!drillData?.data.length && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Particular</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillData.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.student ? (
                          <>
                            <p className="font-medium">{row.student.name_en}</p>
                            <p className="text-xs text-muted-foreground">{row.student.student_uid} · {row.student.class_name}{row.student.section_name ? ` — ${row.student.section_name}` : ""}</p>
                          </>
                        ) : <span className="text-muted-foreground">Unknown</span>}
                      </TableCell>
                      <TableCell className="text-xs">{row.description}</TableCell>
                      <TableCell>{money(row.amount_due + row.fine_amount)}</TableCell>
                      <TableCell>{money(row.amount_paid)}</TableCell>
                      <TableCell className={row.outstanding > 0 ? "text-red-600" : ""}>{money(row.outstanding)}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-right">
                        {row.student && row.outstanding > 0 && (
                          <Button size="sm" variant="outline" onClick={() => setCollectingStudent(row.student ? { id: row.student.id, name_en: row.student.name_en, student_uid: row.student.student_uid } : null)}>
                            Collect
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {drillData && drillData.meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <Button size="sm" variant="outline" disabled={drillPage <= 1} onClick={() => setDrillPage((p) => p - 1)}>Prev</Button>
              <span className="text-muted-foreground">Page {drillPage} of {drillData.meta.totalPages} ({drillData.meta.total} total)</span>
              <Button size="sm" variant="outline" disabled={drillPage >= drillData.meta.totalPages} onClick={() => setDrillPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}

// A batch "Receive Fee" submission may create several Payment rows (one per
// invoice line paid together), but the parent/guardian expects ONE printed
// receipt for the whole transaction -- this hits the combined batch-receipt
// route instead of downloading one PDF per line.
async function downloadBatchReceiptPdf(receiptBatchId: string, receiptNo: string, copy?: "admin" | "student") {
  const res = await api.get(`/api/documents/fee/receipt/batch/${receiptBatchId}`, { responseType: "blob", params: copy ? { copy } : undefined });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Receipt_${receiptNo}${copy ? `_${copy}` : ""}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

interface WorkspaceLine {
  invoice_id: string;
  category: string;
  sub_category: string | null;
  description: string;
  period: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  fine_source: string | null;
  outstanding: number;
  is_manual_fine: boolean;
  waivers: { id: string; waiver_name: string; discount_amount: number }[];
}
interface Workspace {
  student: StudentBasic;
  credit_balance: number;
  lines: WorkspaceLine[];
}

function AdHocFeeForm({ studentId, isFine, onDone }: { studentId: string; isFine: boolean; onDone: () => void }) {
  const [category, setCategory] = useState("TUITION");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/api/fees/invoices/ad-hoc", {
        student_id: studentId,
        category,
        description: description || (isFine ? "Fine" : "One-Time Fee"),
        amount: Number(amount),
        is_manual_fine: isFine,
      }),
    onSuccess: () => {
      toast.success(isFine ? "Fine added" : "Fee added");
      onDone();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to add"),
  });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      {!isFine && (
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <select className="rounded-md border px-2 py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Remarks</Label>
        <Input className="w-40" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isFine ? "Reason for fine" : "Description"} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Amount</Label>
        <Input type="number" className="w-28" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Button size="sm" disabled={!amount || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Adding..." : isFine ? "Add Fine" : "Add Fee"}
      </Button>
    </div>
  );
}

function CollectDialog({ student, onClose }: { student: StudentBasic | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [discounts, setDiscounts] = useState<Record<string, number>>({});
  // Waivers are applied (checked) by default, matching today's standing
  // behavior — unchecking one is a per-collection override ("collect the
  // full amount for this one payment, ignoring the standing waiver just
  // this once"), never a permanent revoke (Plan Fifteen, Phase E).
  const [overriddenWaivers, setOverriddenWaivers] = useState<Set<string>>(new Set());
  const [gateway, setGateway] = useState("CASH");
  const [secondaryReceiptNo, setSecondaryReceiptNo] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [showAdHoc, setShowAdHoc] = useState<"fee" | "fine" | null>(null);
  const [lastBatch, setLastBatch] = useState<{ receipt_batch_id: string; payments: { id: string; receipt_no: string }[] } | null>(null);

  const { data: workspace, isFetching, isError: isWorkspaceError, error: workspaceError, refetch: refetchWorkspace } = useQuery<Workspace>({
    queryKey: ["fees", "collect-workspace", student?.id],
    queryFn: async () => (await api.get(`/api/fees/collect-workspace/${student?.id}`)).data.data,
    enabled: !!student,
  });

  useEffect(() => {
    setSelected(new Set());
    setDiscounts({});
    setOverriddenWaivers(new Set());
    setLastBatch(null);
  }, [student?.id]);

  function overriddenAmountFor(line: WorkspaceLine): number {
    return line.waivers.filter((w) => overriddenWaivers.has(w.id)).reduce((s, w) => s + w.discount_amount, 0);
  }
  function toggleWaiverOverride(waiverId: string) {
    setOverriddenWaivers((prev) => {
      const next = new Set(prev);
      if (next.has(waiverId)) next.delete(waiverId);
      else next.add(waiverId);
      return next;
    });
  }

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/api/fees/generate-for-student/${student?.id}`),
    onSuccess: (res) => {
      const created = res.data.data.created as number;
      toast.success(created > 0 ? `Generated ${created} fee(s) for ${student?.name_en}` : "No new fees to generate — already up to date");
      queryClient.invalidateQueries({ queryKey: ["fees", "collect-workspace", student?.id] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to generate fees"),
  });

  const collectBatchMutation = useMutation({
    mutationFn: () => {
      const lines = [...selected].map((invoiceId) => {
        const line = workspace!.lines.find((l) => l.invoice_id === invoiceId)!;
        const discount = discounts[invoiceId] ?? 0;
        const overriddenIds = line.waivers.filter((w) => overriddenWaivers.has(w.id)).map((w) => w.id);
        const receivable = Math.max(0, line.outstanding + overriddenAmountFor(line) - discount);
        return {
          invoice_id: invoiceId,
          amount: receivable,
          discount_amount: discount || undefined,
          override_waiver_application_ids: overriddenIds.length ? overriddenIds : undefined,
        };
      });
      return api.post("/api/fees/collect-batch", { lines, gateway, secondary_receipt_no: secondaryReceiptNo || undefined, send_sms: sendSms });
    },
    onSuccess: (res) => {
      toast.success("Payment recorded");
      setLastBatch(res.data.data);
      setSelected(new Set());
      setDiscounts({});
      setOverriddenWaivers(new Set());
      queryClient.invalidateQueries({ queryKey: ["fees", "collect-workspace", student?.id] });
      queryClient.invalidateQueries({ queryKey: ["fees", "roster"] });
      queryClient.invalidateQueries({ queryKey: ["fees", "collection-dashboard"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record payment"),
  });

  const lines = workspace?.lines ?? [];
  const total = [...selected].reduce((sum, id) => {
    const line = lines.find((l) => l.invoice_id === id);
    if (!line) return sum;
    const discount = discounts[id] ?? 0;
    return sum + Math.max(0, line.outstanding + overriddenAmountFor(line) - discount);
  }, 0);

  function toggleLine(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={!!student} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Collect Fee — {student?.name_en} <span className="font-mono text-xs text-muted-foreground">{student?.student_uid}</span></DialogTitle>
        </DialogHeader>

        {workspace && workspace.credit_balance > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Credit balance: ৳{workspace.credit_balance} (auto-applied to future invoices)
          </div>
        )}

        {lastBatch && (
          <div className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <p>Payment recorded — receipt <span className="font-mono">{lastBatch.payments[0]?.receipt_no}</span> ({lastBatch.payments.length} item{lastBatch.payments.length > 1 ? "s" : ""})</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadBatchReceiptPdf(lastBatch.receipt_batch_id, lastBatch.payments[0]?.receipt_no ?? "", "admin")}>
                Download Admin Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadBatchReceiptPdf(lastBatch.receipt_batch_id, lastBatch.payments[0]?.receipt_no ?? "", "student")}>
                Download Student Copy
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? "Generating..." : `Generate Fees of ${student?.name_en ?? "student"}`}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAdHoc(showAdHoc === "fee" ? null : "fee")}>+ Add One-Time Fee</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdHoc(showAdHoc === "fine" ? null : "fine")}>+ Add Fine</Button>
          </div>
        </div>

        {showAdHoc && student && (
          <AdHocFeeForm
            studentId={student.id}
            isFine={showAdHoc === "fine"}
            onDone={() => { setShowAdHoc(null); queryClient.invalidateQueries({ queryKey: ["fees", "collect-workspace", student.id] }); }}
          />
        )}

        <div className="max-h-[45vh] overflow-y-auto rounded-md border">
          {isFetching && !lines.length && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!isFetching && isWorkspaceError && (
            <div className="p-4">
              <ErrorState title="Failed to load invoices" description={extractErrorMessage(workspaceError)} retryLabel="Retry" onRetry={() => refetchWorkspace()} />
            </div>
          )}
          {!isFetching && !isWorkspaceError && !lines.length && <EmptyState title="No outstanding invoices" />}
          {!!lines.length && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Particular</TableHead>
                  <TableHead>Receivable</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const discount = discounts[line.invoice_id] ?? 0;
                  const overridden = overriddenAmountFor(line);
                  const receivable = line.outstanding + overridden;
                  return (
                    <Fragment key={line.invoice_id}>
                      <TableRow>
                        <TableCell>
                          <Checkbox checked={selected.has(line.invoice_id)} onCheckedChange={() => toggleLine(line.invoice_id)} disabled={receivable <= 0} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{line.description}{line.is_manual_fine && <Badge variant="destructive" className="ml-2">Fine</Badge>}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.category}{line.sub_category ? ` · ${line.sub_category}` : ""} · {line.period}
                            {" · "}Due {new Date(line.due_date).toLocaleDateString()}
                            {line.fine_amount > 0 && ` · Fine ৳${line.fine_amount}`}
                          </p>
                          {line.fine_amount > 0 && line.fine_source && (
                            <AdjustmentNote>
                              Was due {new Date(line.due_date).toLocaleDateString()} — {line.fine_source}
                            </AdjustmentNote>
                          )}
                        </TableCell>
                        <TableCell>৳{receivable}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-20"
                            value={discounts[line.invoice_id] ?? ""}
                            onChange={(e) => setDiscounts((prev) => ({ ...prev, [line.invoice_id]: Number(e.target.value) }))}
                            disabled={!selected.has(line.invoice_id)}
                          />
                          {selected.has(line.invoice_id) && discount > 0 && (
                            <AdjustmentNote>Manual discount — recorded on this receipt only, not posted to the accounts ledger.</AdjustmentNote>
                          )}
                        </TableCell>
                        <TableCell>৳{Math.max(0, receivable - discount)}</TableCell>
                      </TableRow>
                      {line.waivers.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell>
                            <Checkbox checked={!overriddenWaivers.has(w.id)} onCheckedChange={() => toggleWaiverOverride(w.id)} />
                          </TableCell>
                          <TableCell colSpan={4}>
                            {overriddenWaivers.has(w.id) ? (
                              <AdjustmentNote>Overridden — {w.waiver_name} fund (৳{w.discount_amount}) will be collected in full for this payment. The waiver stays active for future invoices.</AdjustmentNote>
                            ) : (
                              <AdjustmentNote>Waived — {w.waiver_name} fund (৳{w.discount_amount} deducted). Uncheck to collect this amount in full instead, just for this payment.</AdjustmentNote>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select value={gateway} onValueChange={setGateway}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{GATEWAYS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secondary Receipt No.</Label>
              <Input className="w-40" value={secondaryReceiptNo} onChange={(e) => setSecondaryReceiptNo(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={sendSms} onCheckedChange={setSendSms} />
              <Label className="text-xs">Send SMS</Label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-lg font-semibold">Total: ৳{total}</p>
            <Button disabled={!selected.size || collectBatchMutation.isPending} onClick={() => collectBatchMutation.mutate()}>
              {collectBatchMutation.isPending ? "Receiving..." : "Receive Fee"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
