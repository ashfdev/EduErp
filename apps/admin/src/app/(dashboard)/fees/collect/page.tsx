"use client";

import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AdjustmentNote, Badge, Button, Card, CardContent, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, Input, Label,
  PageHeader, PageWrapper, SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { useInstitution } from "@/hooks/use-institution";

interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}
interface RosterStudent {
  id: string;
  name_en: string;
  student_uid: string;
  current_roll_no: string | null;
  total_due: number;
  total_paid: number;
  outstanding: number;
  status: "NO_INVOICE" | "PAID" | "PARTIAL" | "DUE";
}
interface RosterResponse {
  students: RosterStudent[];
  summary: { total_students: number; with_dues: number; fully_paid: number };
}
interface StudentBasic {
  id: string;
  name_en: string;
  student_uid: string;
}
interface WorkspaceLine {
  invoice_id: string;
  category: string;
  sub_category: string | null;
  description: string;
  period: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  fine_source: string | null;
  outstanding: number;
  is_manual_fine: boolean;
  waivers: { waiver_name: string; discount_amount: number }[];
}
interface Workspace {
  student: StudentBasic;
  credit_balance: number;
  lines: WorkspaceLine[];
}

const GATEWAYS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "BKASH", label: "bKash (manual)" },
  { value: "NAGAD", label: "Nagad (manual)" },
  { value: "ROCKET", label: "Rocket (manual)" },
];
const CATEGORIES = ["ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER"];

function rosterStatusBadge(status: RosterStudent["status"]) {
  if (status === "PAID") return <Badge variant="success">Paid</Badge>;
  if (status === "PARTIAL") return <Badge variant="warning">Partial</Badge>;
  if (status === "DUE") return <Badge variant="destructive">Due</Badge>;
  return <Badge variant="outline">No Invoice</Badge>;
}

export default function CollectFeePage() {
  const searchParams = useSearchParams();
  const directStudentId = searchParams.get("student_id");

  const { type } = useInstitution();
  const isUniversity = type === "UNIVERSITY";

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [collectingStudent, setCollectingStudent] = useState<StudentBasic | null>(null);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data: roster, isFetching: rosterLoading } = useQuery<RosterResponse>({
    queryKey: ["fees", "roster", classId, sectionId, groupId],
    queryFn: async () =>
      (await api.get("/api/fees/roster", { params: { class_id: classId, section_id: sectionId || undefined, group_id: groupId || undefined } })).data.data,
    enabled: !!classId,
  });

  const { data: directStudent } = useQuery<{ personal: { id: string; name_en: string; student_uid: string } }>({
    queryKey: ["students", directStudentId],
    queryFn: async () => (await api.get(`/api/students/${directStudentId}`)).data.data,
    enabled: !!directStudentId,
  });

  useEffect(() => {
    if (directStudent) {
      setCollectingStudent({ id: directStudent.personal.id, name_en: directStudent.personal.name_en, student_uid: directStudent.personal.student_uid });
    }
  }, [directStudent]);

  const filteredRoster = roster?.students.filter((s) => {
    if (!rosterSearch.trim()) return true;
    const q = rosterSearch.trim().toLowerCase();
    return s.name_en.toLowerCase().includes(q) || s.student_uid.toLowerCase().includes(q) || (s.current_roll_no ?? "").toLowerCase().includes(q);
  });

  return (
    <PageWrapper>
      <PageHeader title="Collect Fee" subtitle="Browse a roster by class/section, or collect against a specific student's invoices" breadcrumbs={[{ label: "Fees", href: "/fees" }, { label: "Collect" }]} />

      <div className="flex flex-wrap gap-3">
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setGroupId(""); }}>
          <option value="">{isUniversity ? "Select semester..." : "Select class..."}</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
          <option value="">All Sections</option>
          {selectedClass?.sections?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {!!selectedClass?.groups?.length && (
          <select className="rounded-md border px-3 py-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All Groups</option>
            {selectedClass.groups.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
          </select>
        )}
      </div>

      {!classId && <EmptyState title="Select a class to browse its roster" description="Or open a specific student's Fees tab and use its Collect Fee button." />}

      {classId && roster && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Students</p><p className="text-2xl font-semibold">{roster.summary.total_students}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">With Dues</p><p className="text-2xl font-semibold text-red-600">{roster.summary.with_dues}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Fully Paid</p><p className="text-2xl font-semibold text-emerald-600">{roster.summary.fully_paid}</p></CardContent></Card>
          </div>

          <SearchInput placeholder="Search by name, roll, or ID..." value={rosterSearch} onChange={(e) => setRosterSearch(e.target.value)} className="max-w-xs" />

          {!filteredRoster?.length && <EmptyState title={rosterLoading ? "Loading..." : "No students in this filter"} />}

          {!!filteredRoster?.length && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Roll</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoster.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.current_roll_no ?? "—"}</TableCell>
                        <TableCell>
                          <p className="font-medium">{s.name_en}</p>
                          <p className="font-mono text-xs text-muted-foreground">{s.student_uid}</p>
                        </TableCell>
                        <TableCell>{rosterStatusBadge(s.status)}</TableCell>
                        <TableCell>৳{s.outstanding}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setCollectingStudent({ id: s.id, name_en: s.name_en, student_uid: s.student_uid })}>
                            Collect
                          </Button>
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

      <CollectDialog student={collectingStudent} onClose={() => setCollectingStudent(null)} />
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
  const [gateway, setGateway] = useState("CASH");
  const [secondaryReceiptNo, setSecondaryReceiptNo] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [showAdHoc, setShowAdHoc] = useState<"fee" | "fine" | null>(null);
  const [lastBatch, setLastBatch] = useState<{ receipt_batch_id: string; payments: { id: string; receipt_no: string }[] } | null>(null);

  const { data: workspace, isFetching } = useQuery<Workspace>({
    queryKey: ["fees", "collect-workspace", student?.id],
    queryFn: async () => (await api.get(`/api/fees/collect-workspace/${student?.id}`)).data.data,
    enabled: !!student,
  });

  useEffect(() => {
    setSelected(new Set());
    setDiscounts({});
    setLastBatch(null);
  }, [student?.id]);

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
        const receivable = Math.max(0, line.outstanding - discount);
        return { invoice_id: invoiceId, amount: receivable, discount_amount: discount || undefined };
      });
      return api.post("/api/fees/collect-batch", { lines, gateway, secondary_receipt_no: secondaryReceiptNo || undefined, send_sms: sendSms });
    },
    onSuccess: (res) => {
      toast.success("Payment recorded");
      setLastBatch(res.data.data);
      setSelected(new Set());
      setDiscounts({});
      queryClient.invalidateQueries({ queryKey: ["fees", "collect-workspace", student?.id] });
      queryClient.invalidateQueries({ queryKey: ["fees", "roster"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record payment"),
  });

  const lines = workspace?.lines ?? [];
  const total = [...selected].reduce((sum, id) => {
    const line = lines.find((l) => l.invoice_id === id);
    if (!line) return sum;
    const discount = discounts[id] ?? 0;
    return sum + Math.max(0, line.outstanding - discount);
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
          {!isFetching && !lines.length && <EmptyState title="No outstanding invoices" />}
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
                  return (
                    <Fragment key={line.invoice_id}>
                      <TableRow>
                        <TableCell>
                          <Checkbox checked={selected.has(line.invoice_id)} onCheckedChange={() => toggleLine(line.invoice_id)} disabled={line.outstanding <= 0} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{line.description}{line.is_manual_fine && <Badge variant="destructive" className="ml-2">Fine</Badge>}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.category}{line.sub_category ? ` · ${line.sub_category}` : ""} · {line.period}
                            {line.fine_amount > 0 && ` · Fine ৳${line.fine_amount}`}
                          </p>
                          {line.fine_amount > 0 && line.fine_source && <AdjustmentNote>{line.fine_source}</AdjustmentNote>}
                        </TableCell>
                        <TableCell>৳{line.outstanding}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-20"
                            value={discounts[line.invoice_id] ?? ""}
                            onChange={(e) => setDiscounts((prev) => ({ ...prev, [line.invoice_id]: Number(e.target.value) }))}
                            disabled={!selected.has(line.invoice_id)}
                          />
                          {selected.has(line.invoice_id) && discount > 0 && <AdjustmentNote>Staff discount — not journaled</AdjustmentNote>}
                        </TableCell>
                        <TableCell>৳{Math.max(0, line.outstanding - discount)}</TableCell>
                      </TableRow>
                      {line.waivers.map((w, i) => (
                        <TableRow key={`${line.invoice_id}-waiver-${i}`}>
                          <TableCell></TableCell>
                          <TableCell colSpan={4}>
                            <AdjustmentNote>Waived — {w.waiver_name} fund (৳{w.discount_amount} deducted)</AdjustmentNote>
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
