"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  StatusBadge,
  EmptyState,
  SearchInput,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
interface Invoice {
  id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  fine_amount: number;
  status: string;
  due_date: string;
}

const GATEWAYS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "BKASH", label: "bKash (manual)" },
  { value: "NAGAD", label: "Nagad (manual)" },
  { value: "ROCKET", label: "Rocket (manual)" },
];

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
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Roll</th>
                      <th className="p-2">Student</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Outstanding</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.map((s) => (
                      <tr key={s.id} className="border-b">
                        <td className="p-2">{s.current_roll_no ?? "—"}</td>
                        <td className="p-2">
                          <p className="font-medium">{s.name_en}</p>
                          <p className="font-mono text-xs text-muted-foreground">{s.student_uid}</p>
                        </td>
                        <td className="p-2">{rosterStatusBadge(s.status)}</td>
                        <td className="p-2">৳{s.outstanding}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => setCollectingStudent({ id: s.id, name_en: s.name_en, student_uid: s.student_uid })}>
                            Collect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <CollectDialog student={collectingStudent} onClose={() => setCollectingStudent(null)} />
    </PageWrapper>
  );
}

async function downloadReceiptPdf(paymentId: string, receiptNo: string) {
  const res = await api.get(`/api/documents/fee/receipt/${paymentId}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Receipt_${receiptNo}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function CollectDialog({ student, onClose }: { student: StudentBasic | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [gateways, setGateways] = useState<Record<string, string>>({});
  const [lastPayment, setLastPayment] = useState<{ id: string; receipt_no: string } | null>(null);

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["fees", "invoices", "student", student?.id],
    queryFn: async () => (await api.get("/api/fees/invoices", { params: { student_id: student?.id } })).data.data,
    enabled: !!student,
  });

  const collectMutation = useMutation({
    mutationFn: ({ invoiceId, amount, gateway }: { invoiceId: string; amount: number; gateway: string }) =>
      api.post("/api/fees/collect", { invoice_id: invoiceId, amount, gateway }),
    onSuccess: (res, { invoiceId }) => {
      toast.success("Payment collected");
      setAmounts((prev) => ({ ...prev, [invoiceId]: 0 }));
      setLastPayment({ id: res.data.data.payment.id, receipt_no: res.data.data.payment.receipt_no });
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices", "student", student?.id] });
      queryClient.invalidateQueries({ queryKey: ["fees", "roster"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to collect payment";
      toast.error(message);
    },
  });

  const unpaid = invoices?.filter((i) => i.status !== "PAID" && i.status !== "WAIVED") ?? [];

  return (
    <Dialog open={!!student} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collect Fee — {student?.name_en} <span className="font-mono text-xs text-muted-foreground">{student?.student_uid}</span></DialogTitle>
        </DialogHeader>
        {lastPayment && (
          <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <span>Payment recorded — receipt <span className="font-mono">{lastPayment.receipt_no}</span></span>
            <Button size="sm" variant="outline" onClick={() => downloadReceiptPdf(lastPayment.id, lastPayment.receipt_no)}>
              Download Receipt
            </Button>
          </div>
        )}
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {!unpaid.length && <EmptyState title="No outstanding invoices" />}
          {unpaid.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{inv.description}</p>
                    <p className="text-sm text-muted-foreground">Due ৳{inv.amount_due} · Paid ৳{inv.amount_paid} · Fine ৳{inv.fine_amount}</p>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border px-2 py-2 text-sm"
                    value={gateways[inv.id] ?? "CASH"}
                    onChange={(e) => setGateways((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                  >
                    {GATEWAYS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                  <Input
                    type="number"
                    className="w-28"
                    placeholder="Amount"
                    value={amounts[inv.id] || ""}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.id]: Number(e.target.value) }))}
                  />
                  <Button
                    size="sm"
                    disabled={!amounts[inv.id] || collectMutation.isPending}
                    onClick={() => collectMutation.mutate({ invoiceId: inv.id, amount: amounts[inv.id]!, gateway: gateways[inv.id] ?? "CASH" })}
                  >
                    Collect
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(gateways[inv.id] ?? "CASH") === "CASH" || (gateways[inv.id] ?? "CASH") === "BANK_TRANSFER"
                    ? "Recorded immediately as received at the counter."
                    : "Manual entry — use only for a wallet payment you've already confirmed by other means (not the guardian's self-service online payment flow)."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
