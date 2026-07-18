"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, Card, CardContent, Button, Input, Label, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Textarea, Switch,
} from "@education-erp/ui";
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
  department: { name_en: string } | null;
  user: { role: string; phone: string; email: string | null };
  salary_structure: { id: string; name: string } | null;
  subject_assignments: { id: string; subject: { name_en: string; code: string } }[];
  leave_requests: { id: string; leave_type: { name: string }; from_date: string; to_date: string; status: string; reason: string }[];
  payroll_records: { id: string; month: number; year: number; net_salary: number; status: string; payslip_url: string | null }[];
}

interface StaffDocumentRow {
  id: string;
  doc_type: string;
  title: string;
  original_filename: string;
  uploaded_at: string;
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
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
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

  const [profileDraft, setProfileDraft] = useState<{
    show_on_website: boolean;
    qualifications: string;
    achievements: string;
    publications: { title: string; url: string }[];
  } | null>(null);

  function startEditingProfile(s: StaffDetail) {
    setProfileDraft({
      show_on_website: s.show_on_website,
      qualifications: s.qualifications ?? "",
      achievements: s.achievements ?? "",
      publications: s.publications ?? [],
    });
  }

  const updatePublicProfileMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/hr/staff/${id}`, {
        show_on_website: profileDraft!.show_on_website,
        qualifications: profileDraft!.qualifications || undefined,
        achievements: profileDraft!.achievements || undefined,
        publications: profileDraft!.publications.filter((p) => p.title && p.url),
      }),
    onSuccess: () => {
      toast.success("Public profile updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "staff", "detail", id] });
      setProfileDraft(null);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message ?? "Failed to update public profile");
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
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
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
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{staff.staff_uid}</p>
          <p className="text-sm text-muted-foreground">{staff.designation} {staff.department && `· ${staff.department.name_en}`}</p>
        </div>
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
            <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm">
              <div><span className="text-muted-foreground">Role:</span> {staff.user?.role?.replace(/_/g, " ")}</div>
              <div><span className="text-muted-foreground">Employment Type:</span> {staff.employment_type}</div>
              <div><span className="text-muted-foreground">Phone:</span> {staff.phone ?? "—"}</div>
              <div><span className="text-muted-foreground">Email:</span> {staff.email ?? "—"}</div>
              <div><span className="text-muted-foreground">Gender:</span> {staff.gender ?? "—"}</div>
              <div><span className="text-muted-foreground">Blood Group:</span> {staff.blood_group ?? "—"}</div>
              <div><span className="text-muted-foreground">NID:</span> {staff.nid ?? "—"}</div>
              <div><span className="text-muted-foreground">TIN:</span> {staff.tin ?? "—"}</div>
              <div><span className="text-muted-foreground">Joining Date:</span> {staff.joining_date ? new Date(staff.joining_date).toLocaleDateString() : "—"}</div>
              <div><span className="text-muted-foreground">Salary Structure:</span> {staff.salary_structure?.name ?? "Not assigned"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {staff.address ?? "—"}</div>
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
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <CardContent className="pt-6">
              {!staff.subject_assignments.length && <EmptyState title="No subjects assigned" />}
              <table className="w-full text-sm">
                <tbody>
                  {staff.subject_assignments.map((a) => (
                    <tr key={a.id} className="border-b"><td className="p-2">{a.subject.name_en}</td><td className="p-2 font-mono text-xs">{a.subject.code}</td></tr>
                  ))}
                </tbody>
              </table>
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
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Type</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Status</th></tr></thead>
                <tbody>
                  {staff.leave_requests.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="p-2">{l.leave_type.name}</td>
                      <td className="p-2">{new Date(l.from_date).toLocaleDateString()}</td>
                      <td className="p-2">{new Date(l.to_date).toLocaleDateString()}</td>
                      <td className="p-2"><StatusBadge status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardContent className="pt-6">
              {!staff.payroll_records.length && <EmptyState title="No payroll history" />}
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Month</th><th className="p-2">Net Salary</th><th className="p-2">Status</th><th className="p-2">Payslip</th></tr></thead>
                <tbody>
                  {staff.payroll_records.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-2">{p.month}/{p.year}</td>
                      <td className="p-2">৳{p.net_salary}</td>
                      <td className="p-2"><StatusBadge status={p.status} /></td>
                      <td className="p-2"><button onClick={() => downloadPayslip(p.id)} className="text-primary hover:underline">Download</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setDocUploadOpen(true)}>+ Upload Document</Button></div>
          <Card>
            <CardContent className="pt-6">
              {!documents?.length && <EmptyState title="No documents uploaded yet" />}
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Type</th><th className="p-2">Title</th><th className="p-2">File</th><th className="p-2">Uploaded</th><th className="p-2" /></tr></thead>
                <tbody>
                  {documents?.map((d) => (
                    <tr key={d.id} className="border-b">
                      <td className="p-2">{d.doc_type}</td>
                      <td className="p-2">{d.title}</td>
                      <td className="p-2 text-muted-foreground">{d.original_filename}</td>
                      <td className="p-2">{new Date(d.uploaded_at).toLocaleDateString()}</td>
                      <td className="p-2 text-right">
                        <button onClick={() => downloadStaffDocument(d.id)} className="text-primary hover:underline">Download</button>{" "}
                        <button onClick={() => deleteDocMutation.mutate(d.id)} className="text-destructive hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </PageWrapper>
  );
}
