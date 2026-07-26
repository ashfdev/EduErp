"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface DueInvoice {
  id: string;
  student_id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  days_overdue_computed: number;
  student: { name_en: string; student_uid: string; father_phone: string | null };
}
interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
}
interface DefaulterEntry {
  student: { name_en: string; student_uid: string; father_phone: string | null };
  total_due: number;
  invoice_count: number;
}
interface YearOption {
  id: string;
  label: string;
  is_active: boolean;
}

export default function FeeReportsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Fee Reports" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Reports" }]} />
      <Tabs defaultValue="dues">
        <TabsList>
          <TabsTrigger value="dues">Outstanding Dues</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
          <TabsTrigger value="studentDue">Student-wise Due</TabsTrigger>
          <TabsTrigger value="classSummary">Class-wise Summary</TabsTrigger>
          <TabsTrigger value="studentSummary">Student-wise Summary</TabsTrigger>
          <TabsTrigger value="collectionSummary">Collection Summary</TabsTrigger>
          <TabsTrigger value="waivers">Waivers</TabsTrigger>
          <TabsTrigger value="generationLog">Generation Log</TabsTrigger>
          <TabsTrigger value="export">Datewise / Export</TabsTrigger>
        </TabsList>
        <TabsContent value="dues"><DuesTab /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab /></TabsContent>
        <TabsContent value="studentDue"><StudentDueTab /></TabsContent>
        <TabsContent value="classSummary"><ClassSummaryTab /></TabsContent>
        <TabsContent value="studentSummary"><StudentSummaryTab /></TabsContent>
        <TabsContent value="collectionSummary"><CollectionSummaryTab /></TabsContent>
        <TabsContent value="waivers"><WaiversReportTab /></TabsContent>
        <TabsContent value="generationLog"><GenerationLogTab /></TabsContent>
        <TabsContent value="export"><ExportTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

function StudentDueTab() {
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name_en: string; student_uid: string } | null>(null);

  const { data: studentResults } = useQuery<{ id: string; name_en: string; student_uid: string }[]>({
    queryKey: ["students", "search", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch, limit: 5 } })).data.data,
    enabled: studentSearch.length > 1 && !selectedStudent,
  });

  const { data } = useQuery<{ total_due: number; invoices: DueInvoice[] }>({
    queryKey: ["fees", "reports", "student-wise-due", selectedStudent?.id],
    queryFn: async () => (await api.get("/api/fees/reports/student-wise-due", { params: { student_id: selectedStudent!.id } })).data.data,
    enabled: !!selectedStudent,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-w-sm">
        {selectedStudent ? (
          <div className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>{selectedStudent.name_en} ({selectedStudent.student_uid})</span>
            <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
          </div>
        ) : (
          <>
            <Input placeholder="Search student..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            {studentResults?.map((s) => (
              <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                {s.name_en} ({s.student_uid})
              </button>
            ))}
          </>
        )}
      </div>
      {data && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-sm">Total Due: <span className="font-semibold text-red-600">৳{data.total_due}</span></p>
            {!data.invoices.length && <EmptyState title="No outstanding invoices" />}
            {!!data.invoices.length && (
              <Table>
                <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Due</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.description}</TableCell>
                      <TableCell>৳{inv.amount_due}</TableCell>
                      <TableCell>৳{inv.amount_paid}</TableCell>
                      <TableCell><StatusBadge status={(inv as unknown as { status: string }).status ?? "PENDING"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function useActiveYear() {
  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  return years?.find((y) => y.is_active) ?? years?.[0];
}

// A real Session picker (Plan Fifteen, Phase B) — this and StudentSummaryTab
// were previously hard-locked to whatever the active session happened to
// be, with no way to look back at a past session's fee summary at all.
function useSessionPicker() {
  const activeYear = useActiveYear();
  const { data: years } = useQuery<YearOption[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const [yearId, setYearId] = useState("");
  const selectedYearId = yearId || activeYear?.id;
  const picker = (
    <select className="rounded-md border px-3 py-2 text-sm" value={yearId} onChange={(e) => setYearId(e.target.value)}>
      {years?.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? " (active)" : ""}</option>)}
    </select>
  );
  return { selectedYearId, picker };
}

function ClassSummaryTab() {
  const { selectedYearId, picker } = useSessionPicker();
  const { data } = useQuery<{ class_id: string; class_name: string; generated: number; collected: number; due: number }[]>({
    queryKey: ["fees", "reports", "class-wise-summary", selectedYearId],
    queryFn: async () => (await api.get("/api/fees/reports/class-wise-summary", { params: { academic_year_id: selectedYearId } })).data.data,
    enabled: !!selectedYearId,
  });

  return (
    <div className="space-y-4">
      {picker}
      {!data?.length && <EmptyState title="No data for this session" />}
      {!!data?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Generated</TableHead><TableHead>Collected</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.class_id}>
                    <TableCell>{c.class_name}</TableCell>
                    <TableCell>৳{c.generated}</TableCell>
                    <TableCell>৳{c.collected}</TableCell>
                    <TableCell className="text-red-600">৳{c.due}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StudentSummaryTab() {
  const { selectedYearId, picker } = useSessionPicker();
  const [classId, setClassId] = useState("");
  const { data: classes } = useQuery<ClassOption[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });

  const { data } = useQuery<{ student_id: string; name_en: string; student_uid: string; generated: number; collected: number; due: number }[]>({
    queryKey: ["fees", "reports", "student-wise-summary", selectedYearId, classId],
    queryFn: async () => (await api.get("/api/fees/reports/student-wise-summary", { params: { academic_year_id: selectedYearId, class_id: classId || undefined } })).data.data,
    enabled: !!selectedYearId,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {picker}
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All Classes</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
      </div>
      {!data?.length && <EmptyState title="No data for this session" />}
      {!!data?.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Generated</TableHead><TableHead>Collected</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.student_id}>
                    <TableCell>{s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student_uid}</span></TableCell>
                    <TableCell>৳{s.generated}</TableCell>
                    <TableCell>৳{s.collected}</TableCell>
                    <TableCell className="text-red-600">৳{s.due}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CollectionSummaryTab() {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));

  const { data } = useQuery<{ daily: { date: string; amount: number }[]; by_category: { category: string; total: number }[]; gateway_breakdown: { gateway: string; total: number }[] }>({
    queryKey: ["analytics", "fee-collection", from, to],
    queryFn: async () => (await api.get("/api/analytics/fee-collection", { params: { from_date: from, to_date: to } })).data.data,
  });

  const totalCollected = data?.daily.reduce((s, d) => s + d.amount, 0) ?? 0;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-end gap-3">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <p className="text-sm">Total Collected ({from} – {to}): <span className="font-semibold">৳{totalCollected}</span></p>
        {data && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-2 text-sm font-medium">By Category</p>
              {!data.by_category.length && <p className="text-sm text-muted-foreground">No payments in this range</p>}
              {data.by_category.map((c) => (
                <div key={c.category} className="flex justify-between border-b py-1 text-sm"><span>{c.category}</span><span>৳{c.total}</span></div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">By Gateway</p>
              {!data.gateway_breakdown.length && <p className="text-sm text-muted-foreground">No payments in this range</p>}
              {data.gateway_breakdown.map((g) => (
                <div key={g.gateway} className="flex justify-between border-b py-1 text-sm"><span>{g.gateway.replace(/_/g, " ")}</span><span>৳{g.total}</span></div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WaiversReportTab() {
  const { data } = useQuery<{ id: string; discount_amount: number; applied_at: string; invoice: { invoice_no: string; description: string; category: string; student: { name_en: string; student_uid: string } }; student_waiver: { waiver_type: { name: string } } }[]>({
    queryKey: ["fees", "reports", "waivers"],
    queryFn: async () => (await api.get("/api/fees/reports/waivers")).data.data,
  });

  if (!data?.length) return <EmptyState title="No waivers applied yet" />;
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Invoice</TableHead><TableHead>Waiver Type</TableHead><TableHead>Discount</TableHead><TableHead>Applied</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.invoice.student.name_en} <span className="font-mono text-xs text-muted-foreground">{a.invoice.student.student_uid}</span></TableCell>
                <TableCell>{a.invoice.invoice_no} — {a.invoice.description}</TableCell>
                <TableCell>{a.student_waiver.waiver_type.name}</TableCell>
                <TableCell>৳{a.discount_amount}</TableCell>
                <TableCell>{new Date(a.applied_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function GenerationLogTab() {
  const { data } = useQuery<{ id: string; run_at: string; trigger: string; created_count: number; skipped_count: number; month: number | null; year: number | null }[]>({
    queryKey: ["fees", "reports", "generation-log"],
    queryFn: async () => (await api.get("/api/fees/reports/generation-log")).data.data,
  });

  if (!data?.length) return <EmptyState title="No invoice generation runs yet" />;
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Trigger</TableHead><TableHead>Period</TableHead><TableHead>Created</TableHead><TableHead>Skipped</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.run_at).toLocaleString()}</TableCell>
                <TableCell>{r.trigger.replace(/_/g, " ")}</TableCell>
                <TableCell>{r.month && r.year ? `${r.month}/${r.year}` : "—"}</TableCell>
                <TableCell className="text-emerald-600">{r.created_count}</TableCell>
                <TableCell className="text-muted-foreground">{r.skipped_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DuesTab() {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data } = useQuery<DueInvoice[]>({
    queryKey: ["fees", "reports", "dues", classId, sectionId],
    queryFn: async () => (await api.get("/api/fees/reports/dues", { params: { class_id: classId || undefined, section_id: sectionId || undefined } })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
          <option value="">All Classes</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
          <option value="">All Sections</option>
          {selectedClass?.sections?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {!data?.length && <EmptyState title="No outstanding dues" />}
      {!!data?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Student</th><th className="p-2">Description</th><th className="p-2">Due</th><th className="p-2">Days Overdue</th><th className="p-2" /></tr></thead>
              <tbody>
                {data.map((inv) => (
                  <tr key={inv.id} className="border-b">
                    <td className="p-2">{inv.student.name_en}</td>
                    <td className="p-2">{inv.description}</td>
                    <td className="p-2">৳{inv.amount_due - inv.amount_paid}</td>
                    <td className="p-2 text-red-600">{inv.days_overdue_computed}</td>
                    <td className="p-2 text-right">
                      <Link href={`/fees/collect?student_id=${inv.student_id}`}>
                        <Button size="sm" variant="outline">Collect</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DefaultersTab() {
  const [days, setDays] = useState(30);
  const [enabled, setEnabled] = useState(false);
  const { data } = useQuery<DefaulterEntry[]>({
    queryKey: ["fees", "reports", "defaulters", days],
    queryFn: async () => (await api.get("/api/fees/reports/defaulters", { params: { days_overdue: days } })).data.data,
    enabled,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-32" />
        <Button size="sm" onClick={() => setEnabled(true)}>Find Defaulters</Button>
      </div>
      {data && !data.length && <EmptyState title="No defaulters found" />}
      {!!data?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <tbody>
                {data.map((d, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{d.student.name_en}</td>
                    <td className="p-2 font-mono text-xs">{d.student.student_uid}</td>
                    <td className="p-2 text-red-600">৳{d.total_due}</td>
                    <td className="p-2">{d.invoice_count} invoice(s)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface PaymentRow {
  id: string;
  receipt_no: string | null;
  amount: number;
  gateway: string;
  paid_at: string | null;
  invoice: { student: { name_en: string; student_uid: string } };
}

function ExportTab() {
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: payments } = useQuery<{ data: PaymentRow[] }>({
    queryKey: ["fees", "reports", "datewise-payments", from, to],
    queryFn: async () => (await api.get("/api/payments", { params: { from, to, limit: 100 } })).data,
  });

  async function download() {
    const res = await api.get("/api/fees/reports/export", { params: { from, to }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Fee_Collection_${from}_${to}.xlsx`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button onClick={download}>Download Excel</Button>
      </div>
      {payments && !payments.data.length && <EmptyState title="No payments in this range" />}
      {!!payments?.data.length && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Receipt No</TableHead><TableHead>Student</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead></TableRow></TableHeader>
              <TableBody>
                {payments.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.receipt_no ?? "—"}</TableCell>
                    <TableCell>{p.invoice.student.name_en} <span className="font-mono text-xs text-muted-foreground">{p.invoice.student.student_uid}</span></TableCell>
                    <TableCell>৳{p.amount}</TableCell>
                    <TableCell>{p.gateway.replace(/_/g, " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
