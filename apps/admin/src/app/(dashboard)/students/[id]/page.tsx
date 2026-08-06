"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, Input, Label, LoadingSpinner, PageWrapper, PdfPreviewModal, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface StudentDocumentRow {
  id: string;
  doc_type: string;
  original_filename: string;
  uploaded_at: string;
}

interface WaiverRequestSummary {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  created_at: string;
  student_waiver: { waiver_type: { name: string; discount_type: "PERCENTAGE" | "FIXED"; discount_value: number } } | null;
}

interface StudentProfile {
  personal: {
    student_uid: string;
    has_portal_login: boolean;
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
    father_photo_url?: string | null;
    mother_name?: string | null;
    mother_phone?: string | null;
    mother_photo_url?: string | null;
    documents_count: number;
    guardian?: { id: string; name_en: string; relation: string; phone: string; user_id?: string | null } | null;
  };
  academic: {
    current: {
      class?: { id: string; name_en: string } | null;
      section?: { name: string } | null;
      group?: { id: string; name_en: string } | null;
      roll_no?: string | null;
      registration_no?: string | null;
      admission_date?: string | null;
    };
    history: {
      id: string;
      academic_year_id: string;
      academic_year: { label: string };
      class_id: string;
      class?: { name_en: string } | null;
      section?: { name: string } | null;
      roll_no?: string | null;
      notes?: string | null;
      final_gpa?: number | null;
      final_grade?: string | null;
      status: string;
    }[];
  };
  subjects: { subject_id: string; subject_name_en: string; subject_code: string; is_compulsory: boolean; is_inherited: boolean; is_fourth_subject: boolean; assigned_teacher: { name_en: string } | null }[];
  attendance: {
    current_year_summary: { total_days: number; present: number; absent: number; late: number; percentage: number | null };
    most_recent: { date: string; check_in_at: string | null; check_out_at: string | null } | null;
  };
  results: { id: string; exam: { name: string }; subject: { name_en: string }; marks_total?: number | null; grade_letter?: string | null }[];
  fees: {
    invoices: {
      id: string;
      invoice_no: string | null;
      description: string;
      period: string;
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

  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [expandedHistoryYearId, setExpandedHistoryYearId] = useState<string | null>(null);
  const { data: historySubjects, isLoading: historySubjectsLoading } = useQuery<
    { subject_id: string; name_en: string; code: string; is_compulsory: boolean; is_fourth_subject: boolean }[]
  >({
    queryKey: ["students", id, "subjects-for-year", expandedHistoryYearId],
    queryFn: async () => (await api.get(`/api/students/${id}/subjects-for-year/${expandedHistoryYearId}`)).data.data,
    enabled: !!expandedHistoryId && !!expandedHistoryYearId,
  });

  const { data: profile, isLoading, isError, error, refetch } = useQuery<StudentProfile>({
    queryKey: ["students", id],
    queryFn: async () => (await api.get(`/api/students/${id}`)).data.data,
  });

  const { data: documents, isLoading: documentsLoading, isError: documentsError, error: documentsErrorObj, refetch: refetchDocuments } = useQuery<StudentDocumentRow[]>({
    queryKey: ["students", id, "documents"],
    queryFn: async () => (await api.get(`/api/students/${id}/documents`)).data.data,
  });

  const { data: waiverRequests } = useQuery<WaiverRequestSummary[]>({
    queryKey: ["fees", "waiver-requests", id],
    queryFn: async () => (await api.get("/api/fees/waiver-requests", { params: { student_id: id } })).data.data,
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
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to remove document"),
  });

  const replaceDocMutation = useMutation({
    mutationFn: ({ docId, file }: { docId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.put(`/api/students/${id}/documents/${docId}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Document replaced");
      queryClient.invalidateQueries({ queryKey: ["students", id, "documents"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to replace document"),
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

  const [duesMessage, setDuesMessage] = useState<{ action: "graduate" | "transfer" | "expel"; message: string } | null>(null);

  const graduateMutation = useMutation({
    mutationFn: (override?: boolean) => api.post(`/api/students/${id}/graduate`, { graduation_year: graduationYear, override }),
    onSuccess: () => {
      toast.success("Student marked as graduated");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setGraduateOpen(false);
      setDuesMessage(null);
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      const message = extractErrorMessage(err) ?? "Failed to graduate student";
      if (code === "OUTSTANDING_DUES") {
        setDuesMessage({ action: "graduate", message });
        return;
      }
      toast.error(message);
    },
  });

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [credentialModal, setCredentialModal] = useState<{ label: string; phone: string; password: string | null } | null>(null);
  const createLoginMutation = useMutation({
    mutationFn: () => api.post(`/api/students/${id}/create-login`, { phone: loginPhone || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setLoginDialogOpen(false);
      setLoginPhone("");
      setCredentialModal({ label: "Student", phone: res.data.data.phone, password: res.data.data.temp_password });
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err) ?? "Failed to create portal login");
    },
  });

  const [guardianLoginDialogOpen, setGuardianLoginDialogOpen] = useState(false);
  const [guardianLoginPhone, setGuardianLoginPhone] = useState("");
  const createGuardianLoginMutation = useMutation({
    mutationFn: () => api.post(`/api/students/${id}/guardian/create-login`, { phone: guardianLoginPhone || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setGuardianLoginDialogOpen(false);
      setGuardianLoginPhone("");
      setCredentialModal({ label: "Guardian", phone: res.data.data.phone, password: res.data.data.temp_password });
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err) ?? "Failed to create guardian portal login");
    },
  });
  function copyPassword() {
    if (!credentialModal?.password) return;
    navigator.clipboard.writeText(credentialModal.password).then(
      () => toast.success("Password copied"),
      () => toast.error("Couldn't copy — select and copy manually"),
    );
  }

  const leaveMutation = useMutation({
    mutationFn: (override?: boolean) => api.post(`/api/students/${id}/${leaveDialog}`, { reason: leaveReason || undefined, override }),
    onSuccess: () => {
      toast.success(leaveDialog === "transfer" ? "Student marked as transferred — portal access revoked" : "Student marked as expelled — portal access revoked");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setLeaveDialog(null);
      setLeaveReason("");
      setDuesMessage(null);
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      const message = extractErrorMessage(err) ?? "Failed to update student status";
      if (code === "OUTSTANDING_DUES") {
        setDuesMessage({ action: leaveDialog === "expel" ? "expel" : "transfer", message });
        return;
      }
      toast.error(message);
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

  // Edit Subjects — lets an admin correct a student's optional/4th-subject
  // pick directly, without needing to route them through Promote just to
  // fix a mistaken selection (previously the only way to change this).
  const [subjectsEditOpen, setSubjectsEditOpen] = useState(false);
  const [editSelectedOptional, setEditSelectedOptional] = useState<string[]>([]);
  const [editFourthSubjectId, setEditFourthSubjectId] = useState<string>("");
  const currentClassId = profile?.academic.current.class?.id;
  const { data: classSubjects } = useQuery<{ id: string; name_en: string; is_compulsory: boolean; is_optional: boolean }[]>({
    queryKey: ["subjects", "for-student-edit", currentClassId],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: currentClassId } })).data.data,
    enabled: subjectsEditOpen && !!currentClassId,
  });
  const editCompulsory = classSubjects?.filter((s) => s.is_compulsory) ?? [];
  const editOptional = classSubjects?.filter((s) => s.is_optional) ?? [];
  function openSubjectsEdit() {
    const currentSubjects = profile?.subjects ?? [];
    setEditSelectedOptional(currentSubjects.filter((s) => !s.is_inherited).map((s) => s.subject_id));
    setEditFourthSubjectId(currentSubjects.find((s) => s.is_fourth_subject)?.subject_id ?? "");
    setSubjectsEditOpen(true);
  }
  const editSubjectsMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/students/${id}`, {
        selected_optional_subject_ids: editSelectedOptional,
        fourth_subject_id: editFourthSubjectId || null,
      }),
    onSuccess: () => {
      toast.success("Subjects updated");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setSubjectsEditOpen(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to update subjects"),
  });

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      </PageWrapper>
    );
  }

  if (isError || !profile) {
    return (
      <PageWrapper>
        <ErrorState title="Failed to load student" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
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
          {!personal.has_portal_login && (
            <Button size="sm" variant="outline" onClick={() => { setLoginPhone(personal.phone ?? ""); setLoginDialogOpen(true); }}>
              Create Portal Login
            </Button>
          )}
        </div>
        {!["GRADUATED", "TRANSFERRED", "EXPELLED"].includes(personal.status) && (
          <>
            <Button variant="outline" onClick={() => setGraduateOpen(true)}>Mark as Graduated</Button>
            <Button variant="outline" onClick={() => setLeaveDialog("transfer")}>Mark as Transferred</Button>
            <Button variant="destructive" onClick={() => setLeaveDialog("expel")}>Mark as Expelled</Button>
          </>
        )}
      </div>

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Portal Login — {personal.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} placeholder="01XXXXXXXXX" />
              <p className="text-xs text-muted-foreground">
                A temporary password will be generated and sent via SMS. If this phone already has an account (e.g. a
                sibling), it will be linked instead of creating a duplicate.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createLoginMutation.mutate()} disabled={createLoginMutation.isPending || !loginPhone.trim()}>
              {createLoginMutation.isPending ? "Creating..." : "Create Login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guardianLoginDialogOpen} onOpenChange={setGuardianLoginDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Guardian Login — {personal.guardian?.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input value={guardianLoginPhone} onChange={(e) => setGuardianLoginPhone(e.target.value)} placeholder="01XXXXXXXXX" />
              <p className="text-xs text-muted-foreground">
                A temporary password will be generated and sent via SMS. If this phone already has an account (e.g. this
                guardian already has another child enrolled), it will be linked instead of creating a duplicate — that
                linked login sees every one of their active children.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createGuardianLoginMutation.mutate()} disabled={createGuardianLoginMutation.isPending || !guardianLoginPhone.trim()}>
              {createGuardianLoginMutation.isPending ? "Creating..." : "Create Login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credentialModal} onOpenChange={(v) => !v && setCredentialModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{credentialModal?.label} Login Credentials{credentialModal?.label === "Student" ? ` — ${personal.name_en}` : personal.guardian ? ` — ${personal.guardian.name_en}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {credentialModal?.password ? (
              <>
                <p className="text-sm text-amber-700">Save this now — it will not be shown again. It was also sent via SMS to {credentialModal.phone}.</p>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input readOnly value={credentialModal.phone} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Temporary Password</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={credentialModal.password} className="font-mono" />
                    <Button type="button" variant="outline" onClick={copyPassword}>Copy</Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">They will be required to set their own password on first login.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This phone number ({credentialModal?.phone}) already had an account — it was linked instead
                of creating a new one, so no new password was generated.
              </p>
            )}
          </div>
          <DialogFooter><Button onClick={() => setCredentialModal(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={graduateOpen} onOpenChange={setGraduateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {personal.name_en} as Graduated</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Graduation Year</Label>
            <Input type="number" value={graduationYear} onChange={(e) => setGraduationYear(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button onClick={() => graduateMutation.mutate(undefined)} disabled={graduateMutation.isPending}>
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
              onClick={() => leaveMutation.mutate(undefined)}
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

      <ConfirmDialog
        open={!!duesMessage}
        onOpenChange={(open) => !open && setDuesMessage(null)}
        title="Outstanding dues"
        description={duesMessage?.message}
        confirmLabel="Continue anyway"
        destructive={duesMessage?.action === "expel"}
        loading={graduateMutation.isPending || leaveMutation.isPending}
        onConfirm={() => {
          if (duesMessage?.action === "graduate") graduateMutation.mutate(true);
          else leaveMutation.mutate(true);
        }}
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
              <div className="flex items-center gap-2">
                {personal.father_photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={personal.father_photo_url} alt="Father's photo" className="h-8 w-8 rounded-full border object-cover" />
                )}
                <span><span className="text-muted-foreground">Father:</span> {personal.father_name} ({personal.father_phone})</span>
              </div>
              <div className="flex items-center gap-2">
                {personal.mother_photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={personal.mother_photo_url} alt="Mother's photo" className="h-8 w-8 rounded-full border object-cover" />
                )}
                <span><span className="text-muted-foreground">Mother:</span> {personal.mother_name ?? "—"} ({personal.mother_phone ?? "—"})</span>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
                {personal.guardian ? (
                  <div>
                    <p className="text-sm font-medium">
                      Guardian: {personal.guardian.name_en} <span className="font-normal text-muted-foreground">({personal.guardian.relation.toLowerCase()} · {personal.guardian.phone})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {personal.guardian.user_id ? "Has a portal login" : "No portal login yet"} — find this account by the guardian&apos;s own name, not the student&apos;s.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No guardian record linked to this student.</p>
                )}
                {personal.guardian && !personal.guardian.user_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setGuardianLoginPhone(personal.guardian!.phone ?? ""); setGuardianLoginDialogOpen(true); }}
                  >
                    Create Guardian Login
                  </Button>
                )}
              </div>
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
                {academic.history.map((h) => {
                  const fromClass = h.class?.name_en ? `${h.class.name_en}${h.section ? ` · ${h.section.name}` : ""}` : null;
                  const statusPhrase: Record<string, string> = {
                    PROMOTED: "Promoted from",
                    FAILED: "Did not pass",
                    TRANSFERRED: "Transferred from",
                    GRADUATED: "Graduated from",
                  };
                  const isOpen = expandedHistoryId === h.id;
                  return (
                    <div key={h.id} className="border-b">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 py-2 text-left text-sm"
                        onClick={() => {
                          const nextOpen = !isOpen;
                          setExpandedHistoryId(nextOpen ? h.id : null);
                          setExpandedHistoryYearId(nextOpen ? h.academic_year_id : null);
                        }}
                      >
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        <span>
                          {h.academic_year.label} — GPA {h.final_gpa ?? "—"} · {h.final_grade ?? "—"} ·{" "}
                          {fromClass ? `${statusPhrase[h.status] ?? h.status} ${fromClass}` : <StatusBadge status={h.status} />}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="ml-5 space-y-2 rounded-md bg-muted/20 p-3 text-sm">
                          <p><span className="text-muted-foreground">Class:</span> {fromClass ?? "—"}</p>
                          <p><span className="text-muted-foreground">Roll No:</span> {h.roll_no ?? "—"}</p>
                          {h.notes && <p><span className="text-muted-foreground">Notes:</span> {h.notes}</p>}
                          <div>
                            <p className="mb-1 text-muted-foreground">Subjects that year:</p>
                            {historySubjectsLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                            {!historySubjectsLoading && !historySubjects?.length && (
                              <p className="text-xs text-muted-foreground">No subject records found for this year.</p>
                            )}
                            {!historySubjectsLoading && !!historySubjects?.length && (
                              <ul className="ml-4 list-disc space-y-0.5">
                                {historySubjects.map((s) => (
                                  <li key={s.subject_id}>
                                    {s.name_en} ({s.code}){s.is_compulsory ? "" : " · Optional"}{s.is_fourth_subject ? " · 4th Subject" : ""}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={openSubjectsEdit}>Edit Subjects</Button>
          </div>
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
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="font-mono text-xs text-muted-foreground">{inv.invoice_no ?? "—"}</span>
                            <Badge variant="outline">{CATEGORY_LABEL[inv.category] ?? inv.category}</Badge>
                            <Badge variant="outline">{frequencyLabel(inv)}</Badge>
                            {inv.month != null && <span className="text-xs text-muted-foreground">{inv.period}</span>}
                          </div>
                        </TableCell>
                        <TableCell>৳{inv.amount_due}</TableCell>
                        <TableCell>৳{inv.amount_paid}</TableCell>
                        <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/fee/invoice/${inv.id}`, `Invoice ${inv.invoice_no ?? ""}`)}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPdf(`/api/documents/fee/invoice/${inv.id}`, `Invoice_${inv.invoice_no ?? inv.id}.pdf`)}>
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

          {!!waiverRequests?.length && (
            <Card className="mt-4">
              <CardContent className="space-y-3 pt-6">
                <p className="text-sm font-medium">Waiver Requests</p>
                {waiverRequests.map((r) => (
                  <div key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p>{r.reason}</p>
                      <Badge variant={r.status === "APPROVED" ? "default" : r.status === "REJECTED" ? "destructive" : "outline"}>{r.status}</Badge>
                    </div>
                    {r.status === "APPROVED" && r.student_waiver && (
                      <p className="mt-1 text-xs text-emerald-600">
                        Granted: {r.student_waiver.waiver_type.name} (
                        {r.student_waiver.waiver_type.discount_type === "PERCENTAGE" ? `${r.student_waiver.waiver_type.discount_value}%` : `৳${r.student_waiver.waiver_type.discount_value}`}
                        )
                      </p>
                    )}
                    {r.status === "REJECTED" && r.rejection_reason && <p className="mt-1 text-xs text-destructive">Reason: {r.rejection_reason}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
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
              {documentsLoading ? (
                <div className="flex justify-center py-16"><LoadingSpinner /></div>
              ) : documentsError ? (
                <ErrorState title="Failed to load documents" description={extractErrorMessage(documentsErrorObj)} retryLabel="Retry" onRetry={() => refetchDocuments()} />
              ) : (
                <>
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
                          <label className="cursor-pointer text-primary hover:underline">
                            Replace
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) replaceDocMutation.mutate({ docId: d.id, file });
                                e.target.value = "";
                              }}
                            />
                          </label>{" "}
                          <button onClick={() => deleteDocMutation.mutate(d.id)} className="text-destructive hover:underline">Delete</button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={subjectsEditOpen} onOpenChange={setSubjectsEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Subjects — {personal.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Compulsory subjects (auto-assigned)</p>
              <div className="flex flex-wrap gap-2">
                {editCompulsory.length
                  ? editCompulsory.map((s) => <Badge key={s.id} variant="success">{s.name_en}</Badge>)
                  : <p className="text-sm text-muted-foreground">No compulsory subjects configured for this class.</p>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Optional subjects — select which to assign</p>
              <div className="flex flex-wrap gap-2">
                {editOptional.length
                  ? editOptional.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setEditSelectedOptional((prev) => {
                            const next = prev.includes(s.id) ? prev.filter((sid) => sid !== s.id) : [...prev, s.id];
                            if (!next.includes(s.id) && editFourthSubjectId === s.id) setEditFourthSubjectId("");
                            return next;
                          })
                        }
                        className={`rounded-full border px-3 py-1 text-sm ${editSelectedOptional.includes(s.id) ? "border-primary bg-primary/10" : ""}`}
                      >
                        {s.name_en}
                      </button>
                    ))
                  : <p className="text-sm text-muted-foreground">No optional subjects configured for this class.</p>}
              </div>
            </div>
            {editSelectedOptional.length > 0 && (
              <div className="space-y-1.5">
                <Label>4th Subject (BD GPA bonus rule — optional)</Label>
                <p className="text-xs text-muted-foreground">
                  If enabled in Institution Settings, this one subject&apos;s grade point above 2.00 adds a bonus
                  to GPA and a weak score in it never fails the overall result. Every other selected optional
                  subject is graded normally.
                </p>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={editFourthSubjectId} onChange={(e) => setEditFourthSubjectId(e.target.value)}>
                  <option value="">None</option>
                  {editOptional.filter((s) => editSelectedOptional.includes(s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.name_en}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => editSubjectsMutation.mutate()} disabled={editSubjectsMutation.isPending}>
              {editSubjectsMutation.isPending ? "Saving..." : "Save Subjects"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

  const { data, isLoading, isError, error, refetch } = useQuery<{ profile: HealthProfile | null; incidents: HealthIncident[] }>({
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
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save health profile"),
  });

  const addIncidentMutation = useMutation({
    mutationFn: () => api.post(`/api/student-health/student/${studentId}/incidents`, incidentDraft),
    onSuccess: () => {
      toast.success("Incident recorded");
      queryClient.invalidateQueries({ queryKey: ["health", studentId] });
      setIncidentOpen(false);
      setIncidentDraft({ date: new Date().toISOString().slice(0, 10), description: "", action_taken: "" });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to record incident"),
  });

  function openProfileEditor() {
    setProfileDraft(data?.profile ?? {});
    setProfileOpen(true);
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  if (isError) {
    return <ErrorState title="Failed to load health data" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />;
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

  const { data: records, isLoading, isError, error, refetch } = useQuery<DisciplineRecord[]>({
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
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to add discipline record"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Discipline Records</p>
        <Button size="sm" onClick={() => setOpen(true)}>+ Add Record</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load discipline records" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : (
            <>
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
            </>
          )}
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
