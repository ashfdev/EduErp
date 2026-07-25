"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageWrapper, StatusBadge, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffDetail {
  id: string;
  staff_uid: string;
  name_en: string;
  name_bn: string | null;
  designation: string;
  photo_url: string | null;
  is_active: boolean;
  gender: string | null;
  religion: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  nid: string | null;
  tin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  joining_date: string | null;
  employment_type: string;
  max_periods_per_day: number | null;
  max_periods_per_week: number | null;
  show_on_website: boolean;
  qualifications: string | null;
  achievements: string | null;
  publications: { title: string; url: string }[] | null;
  public_contact_email: string | null;
  public_office_location: string | null;
  department: { id: string; name_en: string } | null;
  program: { id: string; name_en: string } | null;
  user: { role: string; phone: string; email: string | null };
  // Raw FK, present for every viewer regardless of role (include always
  // returns base-model scalars) — used for the completeness badge below so
  // it's reliable even for a viewer without PAYROLL_MANAGE_ROLES, unlike the
  // salary_structure relation itself (only populated for that role tier).
  salary_structure_id: string | null;
  salary_structure: { id: string; name: string } | null;
  subject_assignments: { id: string; subject: { name_en: string; code: string } }[];
  leave_requests: { id: string; leave_type: { name: string }; from_date: string; to_date: string; status: string; reason: string }[];
  payroll_records: { id: string; month: number; year: number; net_salary: number; status: string; payslip_url: string | null }[];
  _count: { documents: number };
}

interface Department {
  id: string;
  name_en: string;
}
interface Program {
  id: string;
  name_en: string;
}

interface StaffDocumentRow {
  id: string;
  doc_type: string;
  title: string;
  original_filename: string;
  uploaded_at: string;
}

interface StaffExperienceRow {
  id: string;
  institution_name: string;
  designation: string | null;
  location: string | null;
  responsibility: string | null;
  start_date: string | null;
  end_date: string | null;
}
interface StaffReferenceRow {
  id: string;
  name: string;
  designation: string | null;
  relation: string | null;
  address: string | null;
  phone: string | null;
}
interface SubstitutionHistoryRow {
  id: string;
  date: string;
  reason: string | null;
  original_teacher?: { name_en: string };
  substitute_teacher?: { name_en: string };
  routine_slot: { period_no: number; class: { name_en: string }; section: { name: string } | null; subject: { name_en: string } | null };
}

interface LeaveType {
  id: string;
  name: string;
}
interface LeaveBalance {
  leave_type: { id: string; name: string };
  total_allowed: number;
  used: number;
  remaining: number;
}

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: staff } = useQuery<StaffDetail>({ queryKey: ["hr", "staff", "detail", id], queryFn: async () => (await api.get(`/api/hr/staff/${id}`)).data.data });
  const { data: leaveTypes } = useQuery<LeaveType[]>({ queryKey: ["hr", "leave-types"], queryFn: async () => (await api.get("/api/hr/leave-types")).data.data });
  const { data: balance } = useQuery<LeaveBalance[]>({ queryKey: ["hr", "leaves", "balance", id], queryFn: async () => (await api.get(`/api/hr/leaves/balance/${id}`)).data.data });
  const { data: departments } = useQuery<Department[]>({ queryKey: ["settings", "departments"], queryFn: async () => (await api.get("/api/settings/departments")).data.data });
  const { data: programs } = useQuery<Program[]>({ queryKey: ["settings", "programs"], queryFn: async () => (await api.get("/api/settings/programs")).data.data });

  const applyLeaveMutation = useMutation({
    mutationFn: () => api.post("/api/hr/leaves/apply", { staff_id: id, leave_type_id: leaveTypeId, from_date: fromDate, to_date: toDate, reason }),
    onSuccess: () => {
      toast.success("Leave applied");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["hr", "leaves", "balance", id] });
      setApplyOpen(false);
      setLeaveTypeId(""); setFromDate(""); setToDate(""); setReason("");
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err);
      toast.error(message ?? "Failed to apply leave");
    },
  });

  const updateLoadCapsMutation = useMutation({
    mutationFn: (data: { max_periods_per_day: number | null; max_periods_per_week: number | null }) => api.put(`/api/hr/staff/${id}`, data),
    onSuccess: () => {
      toast.success("Routine load caps updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", "detail", id] });
    },
    onError: () => toast.error("Failed to update routine load caps"),
  });

  const [coreDraft, setCoreDraft] = useState<{
    name_en: string;
    name_bn: string;
    designation: string;
    department_id: string;
    program_id: string;
    phone: string;
    email: string;
    employment_type: string;
    date_of_birth: string;
    gender: string;
    religion: string;
    blood_group: string;
    nid: string;
    tin: string;
    address: string;
  } | null>(null);
  const [corePhotoUrl, setCorePhotoUrl] = useState<string | null>(null);
  const [corePhotoUploading, setCorePhotoUploading] = useState(false);

  function startEditingCore(s: StaffDetail) {
    setCoreDraft({
      name_en: s.name_en,
      name_bn: s.name_bn ?? "",
      designation: s.designation,
      department_id: s.department?.id ?? "",
      program_id: s.program?.id ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      employment_type: s.employment_type,
      date_of_birth: s.date_of_birth ? s.date_of_birth.slice(0, 10) : "",
      gender: s.gender ?? "",
      religion: s.religion ?? "",
      blood_group: s.blood_group ?? "",
      nid: s.nid ?? "",
      tin: s.tin ?? "",
      address: s.address ?? "",
    });
    setCorePhotoUrl(s.photo_url);
  }

  async function handleCorePhotoSelect(file: File | null) {
    if (!file) return;
    setCorePhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.post("/api/hr/staff/photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setCorePhotoUrl(res.data.data.photo_url);
    } catch (err) {
      toast.error(extractErrorMessage(err) ?? "Failed to upload photo");
    } finally {
      setCorePhotoUploading(false);
    }
  }

  const updateCoreProfileMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/hr/staff/${id}`, {
        name_en: coreDraft!.name_en,
        name_bn: coreDraft!.name_bn || undefined,
        designation: coreDraft!.designation,
        department_id: coreDraft!.department_id || null,
        program_id: coreDraft!.program_id || null,
        phone: coreDraft!.phone || undefined,
        email: coreDraft!.email || undefined,
        employment_type: coreDraft!.employment_type,
        date_of_birth: coreDraft!.date_of_birth || undefined,
        gender: coreDraft!.gender || undefined,
        religion: coreDraft!.religion || undefined,
        blood_group: coreDraft!.blood_group || undefined,
        nid: coreDraft!.nid || undefined,
        tin: coreDraft!.tin || undefined,
        address: coreDraft!.address || undefined,
        photo_url: corePhotoUrl || undefined,
      }),
    onSuccess: () => {
      toast.success("Staff details updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", "detail", id] });
      setCoreDraft(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err);
      toast.error(message ?? "Failed to update staff details");
    },
  });

  const [profileDraft, setProfileDraft] = useState<{
    show_on_website: boolean;
    qualifications: string;
    achievements: string;
    publications: { title: string; url: string }[];
    public_contact_email: string;
    public_office_location: string;
  } | null>(null);

  function startEditingProfile(s: StaffDetail) {
    setProfileDraft({
      show_on_website: s.show_on_website,
      qualifications: s.qualifications ?? "",
      achievements: s.achievements ?? "",
      publications: s.publications ?? [],
      public_contact_email: s.public_contact_email ?? "",
      public_office_location: s.public_office_location ?? "",
    });
  }

  const updatePublicProfileMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/hr/staff/${id}`, {
        show_on_website: profileDraft!.show_on_website,
        qualifications: profileDraft!.qualifications || undefined,
        achievements: profileDraft!.achievements || undefined,
        // A publication URL typed without a protocol (e.g. "www.site.com/paper")
        // fails the backend's z.string().url() check — normalize here so the
        // common case just works instead of surfacing a confusing "invalid" error.
        publications: profileDraft!.publications
          .filter((p) => p.title && p.url)
          .map((p) => ({ title: p.title, url: /^https?:\/\//i.test(p.url) ? p.url : `https://${p.url}` })),
        public_contact_email: profileDraft!.public_contact_email || undefined,
        public_office_location: profileDraft!.public_office_location || undefined,
      }),
    onSuccess: () => {
      toast.success("Public profile updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", "detail", id] });
      setProfileDraft(null);
    },
    onError: (err: unknown) => {
      const error = (err as { response?: { data?: { error?: { message?: string; details?: { message?: string }[] } } } })?.response?.data?.error;
      toast.error(error?.details?.[0]?.message ?? error?.message ?? "Failed to update public profile");
    },
  });

  // ── Experience & Reference (Plan Fourteen, Phase B4) ──────────────────
  const { data: experienceRows } = useQuery<StaffExperienceRow[]>({
    queryKey: ["hr", "staff", id, "experience"],
    queryFn: async () => (await api.get(`/api/hr/staff/${id}/experience`)).data.data,
  });
  const { data: referenceRows } = useQuery<StaffReferenceRow[]>({
    queryKey: ["hr", "staff", id, "reference"],
    queryFn: async () => (await api.get(`/api/hr/staff/${id}/reference`)).data.data,
  });

  // ── Substitutions Covered (Plan Fourteen, Phase C4) ────────────────────
  const { data: substitutionData } = useQuery<{ as_original: SubstitutionHistoryRow[]; as_substitute: SubstitutionHistoryRow[] }>({
    queryKey: ["hr", "staff", id, "substitutions"],
    queryFn: async () => (await api.get(`/api/hr/staff/${id}/substitutions`)).data.data,
  });

  const emptyExperienceForm = { institution_name: "", designation: "", location: "", responsibility: "", start_date: "", end_date: "" };
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [experienceForm, setExperienceForm] = useState(emptyExperienceForm);

  function openAddExperience() {
    setEditingExperienceId(null);
    setExperienceForm(emptyExperienceForm);
    setExperienceDialogOpen(true);
  }
  function openEditExperience(row: StaffExperienceRow) {
    setEditingExperienceId(row.id);
    setExperienceForm({
      institution_name: row.institution_name,
      designation: row.designation ?? "",
      location: row.location ?? "",
      responsibility: row.responsibility ?? "",
      start_date: row.start_date ? row.start_date.slice(0, 10) : "",
      end_date: row.end_date ? row.end_date.slice(0, 10) : "",
    });
    setExperienceDialogOpen(true);
  }

  const saveExperienceMutation = useMutation({
    mutationFn: () => {
      const body = {
        institution_name: experienceForm.institution_name,
        designation: experienceForm.designation || undefined,
        location: experienceForm.location || undefined,
        responsibility: experienceForm.responsibility || undefined,
        start_date: experienceForm.start_date || undefined,
        end_date: experienceForm.end_date || undefined,
      };
      return editingExperienceId
        ? api.put(`/api/hr/staff/${id}/experience/${editingExperienceId}`, body)
        : api.post(`/api/hr/staff/${id}/experience`, body);
    },
    onSuccess: () => {
      toast.success(editingExperienceId ? "Experience updated" : "Experience added");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "experience"] });
      setExperienceDialogOpen(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save experience"),
  });

  const deleteExperienceMutation = useMutation({
    mutationFn: (rowId: string) => api.delete(`/api/hr/staff/${id}/experience/${rowId}`),
    onSuccess: () => {
      toast.success("Experience removed");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "experience"] });
    },
  });

  const emptyReferenceForm = { name: "", designation: "", relation: "", address: "", phone: "" };
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [referenceForm, setReferenceForm] = useState(emptyReferenceForm);

  function openAddReference() {
    setEditingReferenceId(null);
    setReferenceForm(emptyReferenceForm);
    setReferenceDialogOpen(true);
  }
  function openEditReference(row: StaffReferenceRow) {
    setEditingReferenceId(row.id);
    setReferenceForm({
      name: row.name,
      designation: row.designation ?? "",
      relation: row.relation ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
    });
    setReferenceDialogOpen(true);
  }

  const saveReferenceMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: referenceForm.name,
        designation: referenceForm.designation || undefined,
        relation: referenceForm.relation || undefined,
        address: referenceForm.address || undefined,
        phone: referenceForm.phone || undefined,
      };
      return editingReferenceId
        ? api.put(`/api/hr/staff/${id}/reference/${editingReferenceId}`, body)
        : api.post(`/api/hr/staff/${id}/reference`, body);
    },
    onSuccess: () => {
      toast.success(editingReferenceId ? "Reference updated" : "Reference added");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "reference"] });
      setReferenceDialogOpen(false);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to save reference"),
  });

  const deleteReferenceMutation = useMutation({
    mutationFn: (rowId: string) => api.delete(`/api/hr/staff/${id}/reference/${rowId}`),
    onSuccess: () => {
      toast.success("Reference removed");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "reference"] });
    },
  });

  const { data: documents } = useQuery<StaffDocumentRow[]>({
    queryKey: ["hr", "staff", id, "documents"],
    queryFn: async () => (await api.get(`/api/hr/staff/${id}/documents`)).data.data,
  });
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [docType, setDocType] = useState("CERTIFICATE");
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

  const uploadDocMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("doc_type", docType);
      formData.append("title", docTitle);
      formData.append("file", docFile!);
      return api.post(`/api/hr/staff/${id}/documents`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "documents"] });
      setDocUploadOpen(false);
      setDocTitle(""); setDocFile(null); setDocType("CERTIFICATE");
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err);
      toast.error(message ?? "Failed to upload document");
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/hr/staff/${id}/documents/${docId}`),
    onSuccess: () => {
      toast.success("Document removed");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "documents"] });
    },
  });

  const replaceDocMutation = useMutation({
    mutationFn: ({ docId, file }: { docId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.put(`/api/hr/staff/${id}/documents/${docId}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Document replaced");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", id, "documents"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to replace document"),
  });

  async function downloadStaffDocument(docId: string) {
    const res = await api.get(`/api/hr/staff/${id}/documents/${docId}/download`);
    window.open(res.data.data.url, "_blank");
  }

  async function downloadPayslip(payrollId: string) {
    const res = await api.get(`/api/documents/payroll/payslip/${payrollId}`, { params: { download: "true" }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-${payrollId}.pdf`;
    a.click();
  }

  async function downloadIdCard() {
    const res = await api.get(`/api/documents/staff/${id}/id-card`, { params: { download: "true" }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IDCard_${staff?.staff_uid ?? id}.pdf`;
    a.click();
  }

  if (!staff) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  return (
    <PageWrapper>
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-20 items-center justify-center rounded-md border bg-muted text-2xl">
          {staff.photo_url ? <img src={staff.photo_url} alt="" className="h-full w-full rounded-md object-cover" /> : "👤"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{staff.name_en}</h1>
            <StatusBadge status={staff.is_active ? "ACTIVE" : "INACTIVE"} />
            {staff._count.documents === 0 && <Badge variant="warning">No documents on file</Badge>}
            {!staff.salary_structure_id && <Badge variant="warning">No salary structure</Badge>}
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{staff.staff_uid}</p>
          <p className="text-sm text-muted-foreground">
            {staff.designation} {staff.department && `· ${staff.department.name_en}`} {staff.program && `· ${staff.program.name_en}`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={downloadIdCard}>Download ID Card</Button>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-medium">Staff Details</p>
                {!coreDraft && <Button size="sm" variant="outline" onClick={() => startEditingCore(staff)}>Edit</Button>}
              </div>

              {!coreDraft && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> {staff.name_en}</div>
                  <div><span className="text-muted-foreground">Designation:</span> {staff.designation}</div>
                  <div><span className="text-muted-foreground">Role:</span> {staff.user?.role?.replace(/_/g, " ")}</div>
                  <div><span className="text-muted-foreground">Employment Type:</span> {staff.employment_type}</div>
                  <div><span className="text-muted-foreground">Department:</span> {staff.department?.name_en ?? "—"}</div>
                  <div><span className="text-muted-foreground">Program:</span> {staff.program?.name_en ?? "—"}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {staff.phone ?? "—"}</div>
                  <div><span className="text-muted-foreground">Email:</span> {staff.email ?? "—"}</div>
                  <div><span className="text-muted-foreground">Gender:</span> {staff.gender ?? "—"}</div>
                  <div><span className="text-muted-foreground">Religion:</span> {staff.religion ?? "—"}</div>
                  <div><span className="text-muted-foreground">Blood Group:</span> {staff.blood_group ?? "—"}</div>
                  <div><span className="text-muted-foreground">Date of Birth:</span> {staff.date_of_birth ? new Date(staff.date_of_birth).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">NID:</span> {staff.nid ?? "—"}</div>
                  <div><span className="text-muted-foreground">TIN:</span> {staff.tin ?? "—"}</div>
                  <div><span className="text-muted-foreground">Joining Date:</span> {staff.joining_date ? new Date(staff.joining_date).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">Salary Structure:</span> {staff.salary_structure?.name ?? "Not assigned"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {staff.address ?? "—"}</div>
                </div>
              )}

              {coreDraft && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    {corePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={corePhotoUrl} alt="Staff photo" className="h-16 w-16 rounded-full border object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">No photo</div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Photo</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        disabled={corePhotoUploading}
                        onChange={(e) => handleCorePhotoSelect(e.target.files?.[0] ?? null)}
                        className="max-w-xs"
                      />
                      {corePhotoUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Full Name</Label><Input value={coreDraft.name_en} onChange={(e) => setCoreDraft({ ...coreDraft, name_en: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Designation</Label><Input value={coreDraft.designation} onChange={(e) => setCoreDraft({ ...coreDraft, designation: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Department</Label>
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={coreDraft.department_id} onChange={(e) => setCoreDraft({ ...coreDraft, department_id: e.target.value })}>
                        <option value="">None</option>
                        {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Program (optional)</Label>
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={coreDraft.program_id} onChange={(e) => setCoreDraft({ ...coreDraft, program_id: e.target.value })}>
                        <option value="">None</option>
                        {programs?.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Phone</Label><Input value={coreDraft.phone} onChange={(e) => setCoreDraft({ ...coreDraft, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
                    <div className="space-y-1.5"><Label>Email</Label><Input value={coreDraft.email} onChange={(e) => setCoreDraft({ ...coreDraft, email: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employment Type</Label>
                    <select className="w-full rounded-md border px-3 py-2 text-sm" value={coreDraft.employment_type} onChange={(e) => setCoreDraft({ ...coreDraft, employment_type: e.target.value })}>
                      <option value="PERMANENT">Permanent</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="PART_TIME">Part Time</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={coreDraft.date_of_birth} onChange={(e) => setCoreDraft({ ...coreDraft, date_of_birth: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Gender</Label>
                      <select className="w-full rounded-md border px-3 py-2 text-sm" value={coreDraft.gender} onChange={(e) => setCoreDraft({ ...coreDraft, gender: e.target.value })}>
                        <option value="">—</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><Label>Blood Group</Label><Input value={coreDraft.blood_group} onChange={(e) => setCoreDraft({ ...coreDraft, blood_group: e.target.value })} placeholder="e.g. O+" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label>Religion</Label><Input value={coreDraft.religion} onChange={(e) => setCoreDraft({ ...coreDraft, religion: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>NID</Label><Input value={coreDraft.nid} onChange={(e) => setCoreDraft({ ...coreDraft, nid: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>TIN</Label><Input value={coreDraft.tin} onChange={(e) => setCoreDraft({ ...coreDraft, tin: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Address</Label><Textarea rows={2} value={coreDraft.address} onChange={(e) => setCoreDraft({ ...coreDraft, address: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateCoreProfileMutation.mutate()} disabled={updateCoreProfileMutation.isPending}>
                      {updateCoreProfileMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCoreDraft(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  Public Website Profile <span className="font-normal text-xs text-muted-foreground">(shown on the Faculty & Staff directory when enabled)</span>
                </p>
                {!profileDraft && <Button size="sm" variant="outline" onClick={() => startEditingProfile(staff)}>Edit</Button>}
              </div>

              {!profileDraft && (
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Shown on website:</span> {staff.show_on_website ? "Yes" : "No"}</p>
                  {staff.public_contact_email && <p><span className="text-muted-foreground">Public Contact Email:</span> {staff.public_contact_email}</p>}
                  {staff.public_office_location && <p><span className="text-muted-foreground">Office Location:</span> {staff.public_office_location}</p>}
                  {staff.qualifications && <p><span className="text-muted-foreground">Qualifications:</span> {staff.qualifications}</p>}
                  {staff.achievements && <p><span className="text-muted-foreground">Achievements:</span> {staff.achievements}</p>}
                  {!!staff.publications?.length && (
                    <div>
                      <span className="text-muted-foreground">Publications:</span>
                      <ul className="ml-4 list-disc">
                        {staff.publications.map((p, i) => <li key={i}><a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{p.title}</a></li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {profileDraft && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={profileDraft.show_on_website} onCheckedChange={(v) => setProfileDraft({ ...profileDraft, show_on_website: v })} />
                    Show on public Faculty & Staff directory
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Public Contact Email (optional)</Label>
                      <Input
                        value={profileDraft.public_contact_email}
                        onChange={(e) => setProfileDraft({ ...profileDraft, public_contact_email: e.target.value })}
                        placeholder="office@institution.edu.bd"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Office Location (optional)</Label>
                      <Input
                        value={profileDraft.public_office_location}
                        onChange={(e) => setProfileDraft({ ...profileDraft, public_office_location: e.target.value })}
                        placeholder="Room 204, Science Building"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A separate, public-safe contact — never the private phone/email used for login. Leave blank to show none.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Qualifications</Label>
                    <Textarea rows={2} value={profileDraft.qualifications} onChange={(e) => setProfileDraft({ ...profileDraft, qualifications: e.target.value })} placeholder="e.g. PhD in Computer Science, University of Dhaka" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Achievements</Label>
                    <Textarea rows={2} value={profileDraft.achievements} onChange={(e) => setProfileDraft({ ...profileDraft, achievements: e.target.value })} placeholder="Awards, recognitions, notable work" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Publications / Papers (optional)</Label>
                    {profileDraft.publications.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder="Paper/journal title"
                          value={p.title}
                          onChange={(e) => {
                            const next = [...profileDraft.publications];
                            next[i] = { ...next[i]!, title: e.target.value };
                            setProfileDraft({ ...profileDraft, publications: next });
                          }}
                        />
                        <Input
                          placeholder="https://..."
                          value={p.url}
                          onChange={(e) => {
                            const next = [...profileDraft.publications];
                            next[i] = { ...next[i]!, url: e.target.value };
                            setProfileDraft({ ...profileDraft, publications: next });
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setProfileDraft({ ...profileDraft, publications: profileDraft.publications.filter((_, idx) => idx !== i) })}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setProfileDraft({ ...profileDraft, publications: [...profileDraft.publications, { title: "", url: "" }] })}
                    >
                      + Add Publication
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updatePublicProfileMutation.mutate()} disabled={updatePublicProfileMutation.isPending}>
                      {updatePublicProfileMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setProfileDraft(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-medium">Experience</p>
                <Button size="sm" variant="outline" onClick={openAddExperience}>+ Add Experience</Button>
              </div>
              {!experienceRows?.length && <EmptyState title="No prior employment on file" />}
              {!!experienceRows?.length && (
                <div className="space-y-2">
                  {experienceRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <div>
                        <p className="font-medium">{row.institution_name}{row.designation ? ` — ${row.designation}` : ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.location && `${row.location} · `}
                          {row.start_date ? new Date(row.start_date).toLocaleDateString() : "—"} to {row.end_date ? new Date(row.end_date).toLocaleDateString() : "Present"}
                          {row.responsibility && ` · ${row.responsibility}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditExperience(row)}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => deleteExperienceMutation.mutate(row.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-medium">Reference</p>
                <Button size="sm" variant="outline" onClick={openAddReference}>+ Add Reference</Button>
              </div>
              {!referenceRows?.length && <EmptyState title="No references on file" />}
              {!!referenceRows?.length && (
                <div className="space-y-2">
                  {referenceRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <div>
                        <p className="font-medium">{row.name}{row.designation ? ` — ${row.designation}` : ""}{row.relation ? ` (${row.relation})` : ""}</p>
                        <p className="text-xs text-muted-foreground">{[row.phone, row.address].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditReference(row)}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => deleteReferenceMutation.mutate(row.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 pt-6">
              <p className="font-medium">Substitutions Covered</p>
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Covered for this staff member (was absent)</p>
                {!substitutionData?.as_original.length && <p className="text-sm text-muted-foreground">No periods covered by others on file</p>}
                {!!substitutionData?.as_original.length && (
                  <div className="space-y-2">
                    {substitutionData.as_original.map((s) => (
                      <div key={s.id} className="rounded-md border p-2 text-sm">
                        <span className="font-medium">{new Date(s.date).toLocaleDateString()}</span> — {s.routine_slot.class.name_en}{s.routine_slot.section ? ` · ${s.routine_slot.section.name}` : ""} · {s.routine_slot.subject?.name_en ?? "—"} (Period {s.routine_slot.period_no}) covered by <span className="font-medium">{s.substitute_teacher?.name_en}</span>
                        {s.reason && <span className="text-muted-foreground"> — {s.reason}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Covered for someone else</p>
                {!substitutionData?.as_substitute.length && <p className="text-sm text-muted-foreground">No substitutions covered on file</p>}
                {!!substitutionData?.as_substitute.length && (
                  <div className="space-y-2">
                    {substitutionData.as_substitute.map((s) => (
                      <div key={s.id} className="rounded-md border p-2 text-sm">
                        <span className="font-medium">{new Date(s.date).toLocaleDateString()}</span> — {s.routine_slot.class.name_en}{s.routine_slot.section ? ` · ${s.routine_slot.section.name}` : ""} · {s.routine_slot.subject?.name_en ?? "—"} (Period {s.routine_slot.period_no}) for <span className="font-medium">{s.original_teacher?.name_en}</span>
                        {s.reason && <span className="text-muted-foreground"> — {s.reason}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <CardContent className="pt-6">
              {!staff.subject_assignments.length && <EmptyState title="No subjects assigned" />}
              <Table>
                <TableBody>
                  {staff.subject_assignments.map((a) => (
                    <TableRow key={a.id}><TableCell>{a.subject.name_en}</TableCell><TableCell className="font-mono text-xs">{a.subject.code}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-3 pt-6">
              <p className="font-medium">Routine Load Caps <span className="font-normal text-xs text-muted-foreground">(optional — used by auto-routine generation to avoid over-booking this teacher)</span></p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Max periods/day</Label>
                  <Input
                    type="number"
                    min={1}
                    defaultValue={staff.max_periods_per_day ?? ""}
                    placeholder="No cap"
                    onBlur={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      if (v !== staff.max_periods_per_day) updateLoadCapsMutation.mutate({ max_periods_per_day: v, max_periods_per_week: staff.max_periods_per_week });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max periods/week</Label>
                  <Input
                    type="number"
                    min={1}
                    defaultValue={staff.max_periods_per_week ?? ""}
                    placeholder="No cap"
                    onBlur={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      if (v !== staff.max_periods_per_week) updateLoadCapsMutation.mutate({ max_periods_per_day: staff.max_periods_per_day, max_periods_per_week: v });
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setApplyOpen(true)}>Apply Leave</Button></div>
          <div className="mb-4 grid grid-cols-4 gap-3">
            {balance?.map((b) => (
              <Card key={b.leave_type.id}><CardContent className="pt-6 text-center">
                <p className="text-sm font-medium">{b.leave_type.name}</p>
                <p className="text-lg font-semibold">{b.remaining}/{b.total_allowed}</p>
                <p className="text-xs text-muted-foreground">remaining</p>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardContent className="pt-6">
              {!staff.leave_requests.length && <EmptyState title="No leave history" />}
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {staff.leave_requests.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.leave_type.name}</TableCell>
                      <TableCell>{new Date(l.from_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(l.to_date).toLocaleDateString()}</TableCell>
                      <TableCell><StatusBadge status={l.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardContent className="pt-6">
              {!staff.payroll_records.length && <EmptyState title="No payroll history" />}
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Month</TableHead><TableHead>Net Salary</TableHead><TableHead>Status</TableHead><TableHead>Payslip</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {staff.payroll_records.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.month}/{p.year}</TableCell>
                      <TableCell>৳{p.net_salary}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell><button onClick={() => downloadPayslip(p.id)} className="text-primary hover:underline">Download</button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setDocUploadOpen(true)}>+ Upload Document</Button></div>
          <Card>
            <CardContent className="pt-6">
              {!documents?.length && <EmptyState title="No documents uploaded yet" />}
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Type</TableHead><TableHead>Title</TableHead><TableHead>File</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {documents?.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.doc_type}</TableCell>
                      <TableCell>{d.title}</TableCell>
                      <TableCell className="text-muted-foreground">{d.original_filename}</TableCell>
                      <TableCell>{new Date(d.uploaded_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <button onClick={() => downloadStaffDocument(d.id)} className="text-primary hover:underline">Download</button>{" "}
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
                <option value="CERTIFICATE">Certificate</option>
                <option value="NID">NID</option>
                <option value="TIN">TIN</option>
                <option value="CONTRACT">Contract</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Title</Label><Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. B.Ed Certificate" /></div>
            <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => uploadDocMutation.mutate()} disabled={uploadDocMutation.isPending || !docTitle || !docFile}>
              {uploadDocMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                <option value="">Select...</option>
                {leaveTypes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!leaveTypeId || !fromDate || !toDate || !reason || applyLeaveMutation.isPending} onClick={() => applyLeaveMutation.mutate()}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={experienceDialogOpen} onOpenChange={setExperienceDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingExperienceId ? "Edit Experience" : "Add Experience"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Institution Name *</Label><Input value={experienceForm.institution_name} onChange={(e) => setExperienceForm({ ...experienceForm, institution_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Designation</Label><Input value={experienceForm.designation} onChange={(e) => setExperienceForm({ ...experienceForm, designation: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={experienceForm.location} onChange={(e) => setExperienceForm({ ...experienceForm, location: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Responsibility</Label><Input value={experienceForm.responsibility} onChange={(e) => setExperienceForm({ ...experienceForm, responsibility: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={experienceForm.start_date} onChange={(e) => setExperienceForm({ ...experienceForm, start_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={experienceForm.end_date} onChange={(e) => setExperienceForm({ ...experienceForm, end_date: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!experienceForm.institution_name || saveExperienceMutation.isPending} onClick={() => saveExperienceMutation.mutate()}>
              {saveExperienceMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={referenceDialogOpen} onOpenChange={setReferenceDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingReferenceId ? "Edit Reference" : "Add Reference"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={referenceForm.name} onChange={(e) => setReferenceForm({ ...referenceForm, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Designation</Label><Input value={referenceForm.designation} onChange={(e) => setReferenceForm({ ...referenceForm, designation: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Relation</Label><Input value={referenceForm.relation} onChange={(e) => setReferenceForm({ ...referenceForm, relation: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={referenceForm.phone} onChange={(e) => setReferenceForm({ ...referenceForm, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={referenceForm.address} onChange={(e) => setReferenceForm({ ...referenceForm, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!referenceForm.name || saveReferenceMutation.isPending} onClick={() => saveReferenceMutation.mutate()}>
              {saveReferenceMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
