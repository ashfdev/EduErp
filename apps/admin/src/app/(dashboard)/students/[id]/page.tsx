"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageWrapper, PdfPreviewModal, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface StudentDocumentRow {
  id: string;
  doc_type: string;
  original_filename: string;
  uploaded_at: string;
}

interface StudentProfile {
  personal: {
    student_uid: string;
    name_en: string;
    name_bn?: string | null;
    photo_url?: string | null;
    status: string;
    gender: string;
    date_of_birth?: string | null;
    religion?: string | null;
    blood_group?: string | null;
    phone?: string | null;
    address_permanent?: string | null;
    father_name?: string | null;
    father_phone?: string | null;
    mother_name?: string | null;
    mother_phone?: string | null;
    documents_count: number;
  };
  academic: {
    current: {
      class?: { name_en: string } | null;
      section?: { name: string } | null;
      group?: { id: string; name_en: string } | null;
      roll_no?: string | null;
      registration_no?: string | null;
      admission_date?: string | null;
    };
    history: {
      academic_year: { label: string };
      class_id: string;
      class?: { name_en: string } | null;
      section?: { name: string } | null;
      final_gpa?: number | null;
      final_grade?: string | null;
      status: string;
    }[];
  };
  subjects: { subject_id: string; subject_name_en: string; subject_code: string; is_compulsory: boolean; is_inherited: boolean; assigned_teacher: { name_en: string } | null }[];
  attendance: {
    current_year_summary: { total_days: number; present: number; absent: number; late: number; percentage: number | null };
    most_recent: { date: string; check_in_at: string | null; check_out_at: string | null } | null;
  };
  results: { id: string; exam: { name: string }; subject: { name_en: string }; marks_total?: number | null; grade_letter?: string | null }[];
  fees: {
    invoices: {
      id: string;
      description: string;
      category: string;
      month?: number | null;
      amount_due: number;
      amount_paid: number;
      fine_amount: number;
      status: string;
      due_date: string;
      fee_structure?: { frequency: string } | null;
      payments?: { id: string; receipt_no: string | null; gateway: string; amount: number; paid_at: string | null; notes: string | null; status: string }[];
    }[];
    outstanding_total: number;
    paid_total: number;
    credit_balance: number;
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  ADMISSION: "Admission", FORM: "Form", READMISSION: "Readmission", TUITION: "Tuition", EXAM: "Exam",
  TRANSPORT: "Transport", HOSTEL: "Hostel", LAB: "Lab", LIBRARY: "Library", SPORTS: "Sports",
  DEVELOPMENT: "Development", OTHER: "Other",
};

function frequencyLabel(inv: { month?: number | null; fee_structure?: { frequency: string } | null }): string {
  const freq = inv.fee_structure?.frequency ?? (inv.month ? "MONTHLY" : "ONE_TIME");
  if (freq === "MONTHLY") return "Monthly";
  if (freq === "YEARLY") return "Yearly";
  return "One-time";
}

async function downloadPdf(url: string, filename: string) {
  const res = await api.get(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduationYear, setGraduationYear] = useState(new Date().getFullYear());
  const [leaveDialog, setLeaveDialog] = useState<"transfer" | "expel" | null>(null);
  const [leaveReason, setLeaveReason] = useState("");
  const pdfPreview = usePdfPreview();

  const { data: subjectAttendance } = useQuery<{ overall: { present: number; total: number; percentage: number }; subjects: { subject_id: string; subject_name_en: string; present: number; total: number; percentage: number | null }[] }>({
    queryKey: ["students", id, "subject-attendance"],
    queryFn: async () => (await api.get(`/api/attendance/subject-wise/student/${id}/summary`)).data.data,
  });

  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const { data: subjectHistory, isLoading: subjectHistoryLoading } = useQuery<{ date: string; period_no: number; status: string }[]>({
    queryKey: ["students", id, "subject-attendance-history", expandedSubjectId],
    queryFn: async () => (await api.get(`/api/attendance/subject-wise/student/${id}/subject/${expandedSubjectId}/history`)).data.data,
    enabled: !!expandedSubjectId,
  });

  const { data: profile, isLoading } = useQuery<StudentProfile>({
    queryKey: ["students", id],
    queryFn: async () => (await api.get(`/api/students/${id}`)).data.data,
  });

  const { data: documents } = useQuery<StudentDocumentRow[]>({
    queryKey: ["students", id, "documents"],
    queryFn: async () => (await api.get(`/api/students/${id}/documents`)).data.data,
  });
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [docType, setDocType] = useState("BIRTH_CERTIFICATE");
  const [docFile, setDocFile] = useState<File | null>(null);

  const uploadDocMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("doc_type", docType);
      formData.append("file", docFile!);
      return api.post(`/api/students/${id}/documents`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      queryClient.invalidateQueries({ queryKey: ["students", id, "documents"] });
      setDocUploadOpen(false);
      setDocFile(null);
      setDocType("BIRTH_CERTIFICATE");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to upload document"),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/students/${id}/documents/${docId}`),
    onSuccess: () => {
      toast.success("Document removed");
      queryClient.invalidateQueries({ queryKey: ["students", id, "documents"] });
    },
  });

  async function downloadStudentDocument(docId: string) {
    const res = await api.get(`/api/students/${id}/documents/${docId}/download`);
    window.open(res.data.data.url, "_blank");
  }

  const [waiveTarget, setWaiveTarget] = useState<{ id: string; description: string; amount_due: number } | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const waiveMutation = useMutation({
    mutationFn: () => api.put(`/api/fees/invoices/${waiveTarget!.id}/waive`, { reason: waiveReason }),
    onSuccess: () => {
      toast.success("Invoice waived");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setWaiveTarget(null);
      setWaiveReason("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to waive invoice"),
  });

  const graduateMutation = useMutation({
    mutationFn: () => api.post(`/api/students/${id}/graduate`, { graduation_year: graduationYear }),
    onSuccess: () => {
      toast.success("Student marked as graduated");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setGraduateOpen(false);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to graduate student";
      toast.error(message);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.post(`/api/students/${id}/${leaveDialog}`, { reason: leaveReason || undefined }),
    onSuccess: () => {
      toast.success(leaveDialog === "transfer" ? "Student marked as transferred — portal access revoked" : "Student marked as expelled — portal access revoked");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setLeaveDialog(null);
      setLeaveReason("");
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err) ?? "Failed to update student status");
    },
  });

  const [refundTarget, setRefundTarget] = useState<{ id: string; amount: number } | null>(null);
  const refundMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/api/payments/${paymentId}/refund`, {}),
    onSuccess: () => {
      toast.success("Payment refunded — invoice and accounting entries updated");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setRefundTarget(null);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Refund failed"),
  });

  if (isLoading || !profile) {
    return (
      <PageWrapper>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageWrapper>
    );
  }

  const { personal, academic, subjects, attendance, results, fees } = profile;

  return (
    <PageWrapper>
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-20 items-center justify-center rounded-md border bg-muted text-2xl">
          {personal.photo_url ? <img src={personal.photo_url} alt="" className="h-full w-full rounded-md object-cover" /> : "👤"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{personal.name_en}</h1>
            <StatusBadge status={personal.status} />
            {personal.documents_count === 0 && <Badge variant="warning">No documents on file</Badge>}
          </div>
          {personal.name_bn && <p className="text-muted-foreground">{personal.name_bn}</p>}
          <p className="mt-1 font-mono text-sm text-muted-foreground">{personal.student_uid}</p>
          <p className="text-sm text-muted-foreground">
            {academic.current.class?.name_en} {academic.current.section && `· Section ${academic.current.section.name}`}{" "}
            {academic.current.group && `· ${academic.current.group.name_en}`} {academic.current.roll_no && `· Roll ${academic.current.roll_no}`}
          </p>
        </div>
        <Link href={`/students/${id}/edit`}>
          <Button variant="outline">Edit</Button>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadPdf(`/api/documents/student/${id}/id-card`, `IDCard_${personal.student_uid}.pdf`)}>
            Download ID Card
          </Button>
          <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/student/${id}/testimonial`, `Testimonial — ${personal.name_en}`)}>
            Testimonial
          </Button>
          <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/student/${id}/transfer-cert`, `Transfer Certificate — ${personal.name_en}`)}>
            Transfer Certificate
          </Button>
        </div>
        {!["GRADUATED", "TRANSFERRED", "EXPELLED"].includes(personal.status) && (
          <>
            <Button variant="outline" onClick={() => setGraduateOpen(true)}>Mark as Graduated</Button>
            <Button variant="outline" onClick={() => setLeaveDialog("transfer")}>Mark as Transferred</Button>
            <Button variant="destructive" onClick={() => setLeaveDialog("expel")}>Mark as Expelled</Button>
          </>
        )}
      </div>

      <Dialog open={graduateOpen} onOpenChange={setGraduateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {personal.name_en} as Graduated</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Graduation Year</Label>
            <Input type="number" value={graduationYear} onChange={(e) => setGraduationYear(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button onClick={() => graduateMutation.mutate()} disabled={graduateMutation.isPending}>
              {graduateMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveDialog !== null} onOpenChange={(open) => !open && setLeaveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark {personal.name_en} as {leaveDialog === "transfer" ? "Transferred" : "Expelled"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This revokes the student&apos;s portal login immediately (and their guardian&apos;s too, if this was their only
            still-enrolled child). This cannot be undone from here — contact IT Admin if this was a mistake.
          </p>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button
              variant={leaveDialog === "expel" ? "destructive" : "default"}
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
            >
              {leaveMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={refundTarget !== null}
        onOpenChange={(open) => !open && setRefundTarget(null)}
        title="Refund this payment?"
        description={refundTarget ? `Refund ৳${refundTarget.amount}? This reverses its accounting entry and reduces the invoice's paid amount. This cannot be undone from here.` : undefined}
        confirmLabel="Refund"
        destructive
        loading={refundMutation.isPending}
        onConfirm={() => refundTarget && refundMutation.mutate(refundTarget.id)}
      />

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="discipline">Discipline</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm">
              <div><span className="text-muted-foreground">Gender:</span> {personal.gender}</div>
              <div><span className="text-muted-foreground">Date of Birth:</span> {personal.date_of_birth ? new Date(personal.date_of_birth).toLocaleDateString() : "—"}</div>
              <div><span className="text-muted-foreground">Religion:</span> {personal.religion ?? "—"}</div>
              <div><span className="text-muted-foreground">Blood Group:</span> {personal.blood_group ?? "—"}</div>
              <div><span className="text-muted-foreground">Phone:</span> {personal.phone ?? "—"}</div>
              <div><span className="text-muted-foreground">Address:</span> {personal.address_permanent ?? "—"}</div>
              <div><span className="text-muted-foreground">Father:</span> {personal.father_name} ({personal.father_phone})</div>
              <div><span className="text-muted-foreground">Mother:</span> {personal.mother_name ?? "—"} ({personal.mother_phone ?? "—"})</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academic">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="text-sm">
                <p><span className="text-muted-foreground">Registration No:</span> {academic.current.registration_no ?? "—"}</p>
                <p><span className="text-muted-foreground">Admission Date:</span> {academic.current.admission_date ? new Date(academic.current.admission_date).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Academic History</p>
                {!academic.history.length && <p className="text-sm text-muted-foreground">No promotion history yet.</p>}
                {academic.history.map((h, i) => {
                  const fromClass = h.class?.name_en ? `${h.class.name_en}${h.section ? ` · ${h.section.name}` : ""}` : null;
                  const statusPhrase: Record<string, string> = {
                    PROMOTED: "Promoted from",
                    FAILED: "Did not pass",
                    TRANSFERRED: "Transferred from",
                    GRADUATED: "Graduated from",
                  };
                  return (
                    <div key={i} className="border-b py-2 text-sm">
                      {h.academic_year.label} — GPA {h.final_gpa ?? "—"} · {h.final_grade ?? "—"} ·{" "}
                      {fromClass ? `${statusPhrase[h.status] ?? h.status} ${fromClass}` : <StatusBadge status={h.status} />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Teacher</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((s) => (
                    <TableRow key={s.subject_id}>
                      <TableCell>{s.subject_name_en}</TableCell>
                      <TableCell className="font-mono text-xs">{s.subject_code}</TableCell>
                      <TableCell><Badge variant={s.is_compulsory ? "default" : "outline"}>{s.is_compulsory ? "Compulsory" : "Optional"}</Badge></TableCell>
                      <TableCell>{s.assigned_teacher?.name_en ?? "Unassigned"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!subjects.length && <div className="p-6"><EmptyState title="No subjects assigned yet" /></div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="grid grid-cols-4 gap-4 pt-6 text-center">
              <div><p className="text-2xl font-semibold">{attendance.current_year_summary.total_days}</p><p className="text-xs text-muted-foreground">Total Days</p></div>
              <div><p className="text-2xl font-semibold text-emerald-600">{attendance.current_year_summary.present}</p><p className="text-xs text-muted-foreground">Present</p></div>
              <div><p className="text-2xl font-semibold text-red-600">{attendance.current_year_summary.absent}</p><p className="text-xs text-muted-foreground">Absent</p></div>
              <div><p className="text-2xl font-semibold">{attendance.current_year_summary.percentage ?? "—"}%</p><p className="text-xs text-muted-foreground">Attendance</p></div>
            </CardContent>
          </Card>
          {attendance.most_recent && (attendance.most_recent.check_in_at || attendance.most_recent.check_out_at) && (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium">Most Recent Campus Entry/Exit — {new Date(attendance.most_recent.date).toLocaleDateString()}</p>
                <div className="flex gap-6 text-sm">
                  <span>In: <span className="font-semibold">{attendance.most_recent.check_in_at ? new Date(attendance.most_recent.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span></span>
                  <span>Out: <span className="font-semibold">{attendance.most_recent.check_out_at ? new Date(attendance.most_recent.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span></span>
                </div>
              </CardContent>
            </Card>
          )}
          {subjectAttendance && !!subjectAttendance.subjects.length && (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <p className="mb-3 text-sm font-medium">Subject-Wise Attendance (this year)</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Sessions</TableHead>
                      <TableHead>Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjectAttendance.subjects.map((s) => {
                      const isOpen = expandedSubjectId === s.subject_id;
                      return (
                        <Fragment key={s.subject_id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => setExpandedSubjectId(isOpen ? null : s.subject_id)}
                          >
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                {s.subject_name_en}
                              </span>
                            </TableCell>
                            <TableCell>{s.percentage === null ? "—" : `${s.present} / ${s.total}`}</TableCell>
                            <TableCell>
                              {s.percentage === null ? (
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">No attendance recorded yet</span>
                              ) : (
                                <span className={`font-semibold ${s.percentage >= 90 ? "text-emerald-600" : s.percentage >= 75 ? "text-amber-600" : "text-red-600"}`}>{s.percentage}%</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow key={`${s.subject_id}-detail`} className="bg-muted/20">
                              <TableCell colSpan={3} className="p-3">
                                {subjectHistoryLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                                {!subjectHistoryLoading && !subjectHistory?.length && (
                                  <p className="text-xs text-muted-foreground">No sessions recorded yet.</p>
                                )}
                                {!subjectHistoryLoading && !!subjectHistory?.length && (
                                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                                    {subjectHistory.map((h, i) => (
                                      <div key={`${h.date}-${h.period_no}-${i}`} className="flex items-center justify-between rounded bg-background px-2.5 py-1 text-xs">
                                        <span className="text-muted-foreground">
                                          {new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · Period {h.period_no}
                                        </span>
                                        <StatusBadge status={h.status} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardContent className="pt-6">
              {!results.length && <EmptyState title="No results published yet" />}
              <Table>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.exam.name}</TableCell>
                      <TableCell>{r.subject.name_en}</TableCell>
                      <TableCell>{r.marks_total ?? "—"}</TableCell>
                      <TableCell>{r.grade_letter ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex gap-6 text-sm">
                  <p><span className="text-muted-foreground">Outstanding:</span> <span className="font-semibold text-red-600">৳{fees.outstanding_total}</span></p>
                  <p><span className="text-muted-foreground">Paid:</span> ৳{fees.paid_total}</p>
                  {fees.credit_balance > 0 && (
                    <p><span className="text-muted-foreground">Credit Balance:</span> <span className="font-semibold text-emerald-600">৳{fees.credit_balance}</span></p>
                  )}
                </div>
                <Link href={`/fees/collect?student_id=${id}`}>
                  <Button size="sm">Collect Fee</Button>
                </Link>
              </div>
              {!fees.invoices.length && <EmptyState title="No invoices yet" />}
              <Table>
                <TableBody>
                  {fees.invoices.map((inv) => (
                    <Fragment key={inv.id}>
                      <TableRow>
                        <TableCell>
                          {inv.description}
                          <div className="mt-1 flex gap-1">
                            <Badge variant="outline">{CATEGORY_LABEL[inv.category] ?? inv.category}</Badge>
                            <Badge variant="outline">{frequencyLabel(inv)}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>৳{inv.amount_due}</TableCell>
                        <TableCell>৳{inv.amount_paid}</TableCell>
                        <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/fee/invoice/${inv.id}`, `Invoice — ${inv.id}`)}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPdf(`/api/documents/fee/invoice/${inv.id}`, `Invoice_${inv.id}.pdf`)}>
                            Download
                          </Button>
                          {inv.status !== "PAID" && inv.status !== "WAIVED" && (
                            <Button size="sm" variant="outline" onClick={() => setWaiveTarget({ id: inv.id, description: inv.description, amount_due: inv.amount_due })}>
                              Waive
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {!!inv.payments?.length && (
                        <TableRow key={`${inv.id}-payments`} className="bg-muted/30">
                          <TableCell colSpan={6} className="px-2 pb-2">
                            <Table className="text-xs">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="pl-4">Receipt No</TableHead>
                                  <TableHead>Method</TableHead>
                                  <TableHead>Amount</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Notes</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {inv.payments.map((p) => (
                                  <TableRow key={p.id}>
                                    <TableCell className="pl-4 font-mono">{p.receipt_no ?? "—"}</TableCell>
                                    <TableCell>{p.gateway.replace(/_/g, " ")}</TableCell>
                                    <TableCell>৳{p.amount}</TableCell>
                                    <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                                    <TableCell>{p.notes ?? "—"}</TableCell>
                                    <TableCell>{p.status === "REFUNDED" ? <Badge variant="destructive">Refunded</Badge> : p.status}</TableCell>
                                    <TableCell className="text-right space-x-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => pdfPreview.openPreview(`/api/documents/fee/receipt/${p.id}`, `Receipt — ${p.receipt_no ?? p.id}`)}
                                      >
                                        View
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => downloadPdf(`/api/documents/fee/receipt/${p.id}`, `Receipt_${p.receipt_no ?? p.id}.pdf`)}
                                      >
                                        Download
                                      </Button>
                                      {p.status === "COMPLETED" && (
                                        <Button size="sm" variant="destructive" onClick={() => setRefundTarget({ id: p.id, amount: p.amount })}>
                                          Refund
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <StudentHealthTab studentId={id} />
        </TabsContent>

        <TabsContent value="discipline">
          <StudentDisciplineTab studentId={id} />
        </TabsContent>

        <TabsContent value="documents">
          <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setDocUploadOpen(true)}>+ Upload Document</Button></div>
          <Card>
            <CardContent className="pt-6">
              {!documents?.length && <EmptyState title="No documents uploaded yet" />}
              {!!documents?.length && (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Type</TableHead><TableHead>File</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.doc_type.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-muted-foreground">{d.original_filename}</TableCell>
                        <TableCell>{new Date(d.uploaded_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <button onClick={() => downloadStudentDocument(d.id)} className="text-primary hover:underline">Download</button>{" "}
                          <button onClick={() => deleteDocMutation.mutate(d.id)} className="text-destructive hover:underline">Delete</button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={docUploadOpen} onOpenChange={setDocUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="BIRTH_CERTIFICATE">Birth Certificate</option>
                <option value="TRANSFER_CERTIFICATE">Transfer Certificate</option>
                <option value="TESTIMONIAL">Testimonial</option>
                <option value="ACADEMIC_CERTIFICATE">Academic Certificate</option>
                <option value="MARKSHEET">Marksheet</option>
                <option value="FATHER_NID">Father&apos;s NID</option>
                <option value="MOTHER_NID">Mother&apos;s NID</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => uploadDocMutation.mutate()} disabled={uploadDocMutation.isPending || !docFile}>
              {uploadDocMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!waiveTarget} onOpenChange={(open) => { if (!open) { setWaiveTarget(null); setWaiveReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Waive Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {waiveTarget && (
              <p className="text-sm text-muted-foreground">{waiveTarget.description} — ৳{waiveTarget.amount_due}</p>
            )}
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="e.g. Sibling discount approved by Principal" />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!waiveReason || waiveMutation.isPending} onClick={() => waiveMutation.mutate()}>
              {waiveMutation.isPending ? "Waiving..." : "Confirm Waive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfPreviewModal
        open={pdfPreview.open}
        onOpenChange={(open) => !open && pdfPreview.closePreview()}
        title={pdfPreview.title}
        pdfUrl={pdfPreview.url}
      />
    </PageWrapper>
  );
}

interface HealthProfile {
  allergies?: string | null;
  chronic_conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}
interface HealthIncident {
  id: string;
  date: string;
  description: string;
  action_taken?: string | null;
}

function StudentHealthTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<HealthProfile>({});
  const [incidentDraft, setIncidentDraft] = useState({ date: new Date().toISOString().slice(0, 10), description: "", action_taken: "" });

  const { data } = useQuery<{ profile: HealthProfile | null; incidents: HealthIncident[] }>({
    queryKey: ["health", studentId],
    queryFn: async () => (await api.get(`/api/student-health/student/${studentId}`)).data.data,
  });

  const saveProfileMutation = useMutation({
    mutationFn: () => api.put(`/api/student-health/student/${studentId}/profile`, profileDraft),
    onSuccess: () => {
      toast.success("Health profile saved");
      queryClient.invalidateQueries({ queryKey: ["health", studentId] });
      setProfileOpen(false);
    },
  });

  const addIncidentMutation = useMutation({
    mutationFn: () => api.post(`/api/student-health/student/${studentId}/incidents`, incidentDraft),
    onSuccess: () => {
      toast.success("Incident recorded");
      queryClient.invalidateQueries({ queryKey: ["health", studentId] });
      setIncidentOpen(false);
      setIncidentDraft({ date: new Date().toISOString().slice(0, 10), description: "", action_taken: "" });
    },
  });

  function openProfileEditor() {
    setProfileDraft(data?.profile ?? {});
    setProfileOpen(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">Health Profile</p>
            <Button size="sm" variant="outline" onClick={openProfileEditor}>Edit</Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><span className="text-muted-foreground">Allergies:</span> {data?.profile?.allergies ?? "—"}</div>
            <div><span className="text-muted-foreground">Chronic Conditions:</span> {data?.profile?.chronic_conditions ?? "—"}</div>
            <div><span className="text-muted-foreground">Emergency Contact:</span> {data?.profile?.emergency_contact_name ?? "—"} ({data?.profile?.emergency_contact_phone ?? "—"})</div>
            <div><span className="text-muted-foreground">Notes:</span> {data?.profile?.notes ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Incident Log</p>
        <Button size="sm" onClick={() => setIncidentOpen(true)}>+ Add Incident</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {!data?.incidents.length && <EmptyState title="No health incidents recorded" />}
          <Table>
            <TableBody>
              {data?.incidents.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-muted-foreground">{new Date(i.date).toLocaleDateString()}</TableCell>
                  <TableCell>{i.description}</TableCell>
                  <TableCell className="text-muted-foreground">{i.action_taken ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Health Profile</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Allergies</Label><Input value={profileDraft.allergies ?? ""} onChange={(e) => setProfileDraft((p) => ({ ...p, allergies: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Chronic Conditions</Label><Input value={profileDraft.chronic_conditions ?? ""} onChange={(e) => setProfileDraft((p) => ({ ...p, chronic_conditions: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Emergency Contact Name</Label><Input value={profileDraft.emergency_contact_name ?? ""} onChange={(e) => setProfileDraft((p) => ({ ...p, emergency_contact_name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Emergency Contact Phone</Label><Input value={profileDraft.emergency_contact_phone ?? ""} onChange={(e) => setProfileDraft((p) => ({ ...p, emergency_contact_phone: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={profileDraft.notes ?? ""} onChange={(e) => setProfileDraft((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={incidentOpen} onOpenChange={setIncidentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Health Incident</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={incidentDraft.date} onChange={(e) => setIncidentDraft((p) => ({ ...p, date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={incidentDraft.description} onChange={(e) => setIncidentDraft((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Action Taken</Label><Input value={incidentDraft.action_taken} onChange={(e) => setIncidentDraft((p) => ({ ...p, action_taken: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => addIncidentMutation.mutate()} disabled={addIncidentMutation.isPending || !incidentDraft.description}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DisciplineRecord {
  id: string;
  category: string;
  description: string;
  action_taken?: string | null;
  occurred_at: string;
}

function StudentDisciplineTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "INCIDENT", description: "", action_taken: "" });

  const { data: records } = useQuery<DisciplineRecord[]>({
    queryKey: ["discipline", studentId],
    queryFn: async () => (await api.get(`/api/discipline/student/${studentId}`)).data.data,
  });

  const addMutation = useMutation({
    mutationFn: () => api.post(`/api/discipline/student/${studentId}`, draft),
    onSuccess: () => {
      toast.success("Record added");
      queryClient.invalidateQueries({ queryKey: ["discipline", studentId] });
      setOpen(false);
      setDraft({ category: "INCIDENT", description: "", action_taken: "" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Discipline Records</p>
        <Button size="sm" onClick={() => setOpen(true)}>+ Add Record</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {!records?.length && <EmptyState title="No discipline records" />}
          <Table>
            <TableBody>
              {records?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{new Date(r.occurred_at).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={r.category === "COMMENDATION" ? "default" : "outline"}>{r.category}</Badge></TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-muted-foreground">{r.action_taken ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Discipline Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
                <option value="INCIDENT">Incident</option>
                <option value="COUNSELING">Counseling</option>
                <option value="COMMENDATION">Commendation</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Action Taken</Label><Input value={draft.action_taken} onChange={(e) => setDraft((p) => ({ ...p, action_taken: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !draft.description}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
