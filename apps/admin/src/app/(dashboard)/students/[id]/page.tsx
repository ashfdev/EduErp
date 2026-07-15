"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  Card,
  CardContent,
  Badge,
  StatusBadge,
  Button,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

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
  };
  academic: {
    current: { class?: { name_en: string } | null; section?: { name: string } | null; roll_no?: string | null; registration_no?: string | null; admission_date?: string | null };
    history: { academic_year: { label: string }; class_id: string; final_gpa?: number | null; final_grade?: string | null; status: string }[];
  };
  subjects: { subject_id: string; subject_name_en: string; subject_code: string; is_compulsory: boolean; is_inherited: boolean; assigned_teacher: { name_en: string } | null }[];
  attendance: { current_year_summary: { total_days: number; present: number; absent: number; late: number; percentage: number | null } };
  results: { id: string; exam: { name: string }; subject: { name_en: string }; marks_total?: number | null; grade_letter?: string | null }[];
  fees: {
    invoices: {
      id: string;
      description: string;
      amount_due: number;
      amount_paid: number;
      fine_amount: number;
      status: string;
      due_date: string;
      payments?: { id: string; receipt_no: string | null; gateway: string; amount: number; paid_at: string | null; notes: string | null }[];
    }[];
    outstanding_total: number;
    paid_total: number;
  };
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduationYear, setGraduationYear] = useState(new Date().getFullYear());

  const { data: profile, isLoading } = useQuery<StudentProfile>({
    queryKey: ["students", id],
    queryFn: async () => (await api.get(`/api/students/${id}`)).data.data,
  });

  const graduateMutation = useMutation({
    mutationFn: () => api.post(`/api/students/${id}/graduate`, { graduation_year: graduationYear }),
    onSuccess: () => {
      toast.success("Student marked as graduated");
      queryClient.invalidateQueries({ queryKey: ["students", id] });
      setGraduateOpen(false);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to graduate student";
      toast.error(message);
    },
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
          </div>
          {personal.name_bn && <p className="text-muted-foreground">{personal.name_bn}</p>}
          <p className="mt-1 font-mono text-sm text-muted-foreground">{personal.student_uid}</p>
          <p className="text-sm text-muted-foreground">
            {academic.current.class?.name_en} {academic.current.section && `· Section ${academic.current.section.name}`} {academic.current.roll_no && `· Roll ${academic.current.roll_no}`}
          </p>
        </div>
        <Link href={`/students/${id}/edit`}>
          <Button variant="outline">Edit</Button>
        </Link>
        {personal.status !== "GRADUATED" && (
          <Button variant="outline" onClick={() => setGraduateOpen(true)}>Mark as Graduated</Button>
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
                {academic.history.map((h, i) => (
                  <div key={i} className="border-b py-2 text-sm">
                    {h.academic_year.label} — GPA {h.final_gpa ?? "—"} · {h.final_grade ?? "—"} · <StatusBadge status={h.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <CardContent className="pt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Subject</th>
                    <th className="p-2">Code</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.subject_id} className="border-b">
                      <td className="p-2">{s.subject_name_en}</td>
                      <td className="p-2 font-mono text-xs">{s.subject_code}</td>
                      <td className="p-2"><Badge variant={s.is_compulsory ? "default" : "outline"}>{s.is_compulsory ? "Compulsory" : "Optional"}</Badge></td>
                      <td className="p-2">{s.assigned_teacher?.name_en ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!subjects.length && <EmptyState title="No subjects assigned yet" />}
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
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardContent className="pt-6">
              {!results.length && <EmptyState title="No results published yet" />}
              <table className="w-full text-sm">
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.exam.name}</td>
                      <td className="p-2">{r.subject.name_en}</td>
                      <td className="p-2">{r.marks_total ?? "—"}</td>
                      <td className="p-2">{r.grade_letter ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex gap-6 text-sm">
                <p><span className="text-muted-foreground">Outstanding:</span> <span className="font-semibold text-red-600">৳{fees.outstanding_total}</span></p>
                <p><span className="text-muted-foreground">Paid:</span> ৳{fees.paid_total}</p>
              </div>
              {!fees.invoices.length && <EmptyState title="No invoices yet" />}
              <table className="w-full text-sm">
                <tbody>
                  {fees.invoices.map((inv) => (
                    <>
                      <tr key={inv.id} className="border-b">
                        <td className="p-2">{inv.description}</td>
                        <td className="p-2">৳{inv.amount_due}</td>
                        <td className="p-2">৳{inv.amount_paid}</td>
                        <td className="p-2">{new Date(inv.due_date).toLocaleDateString()}</td>
                        <td className="p-2"><StatusBadge status={inv.status} /></td>
                      </tr>
                      {!!inv.payments?.length && (
                        <tr key={`${inv.id}-payments`} className="border-b bg-muted/30">
                          <td colSpan={5} className="px-2 pb-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1 pl-4">Receipt No</th>
                                  <th className="py-1">Method</th>
                                  <th className="py-1">Amount</th>
                                  <th className="py-1">Date</th>
                                  <th className="py-1">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.payments.map((p) => (
                                  <tr key={p.id}>
                                    <td className="py-1 pl-4 font-mono">{p.receipt_no ?? "—"}</td>
                                    <td className="py-1">{p.gateway.replace(/_/g, " ")}</td>
                                    <td className="py-1">৳{p.amount}</td>
                                    <td className="py-1">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</td>
                                    <td className="py-1">{p.notes ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <StudentHealthTab studentId={id} />
        </TabsContent>

        <TabsContent value="discipline">
          <StudentDisciplineTab studentId={id} />
        </TabsContent>
      </Tabs>
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
          <table className="w-full text-sm">
            <tbody>
              {data?.incidents.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="p-2 text-muted-foreground">{new Date(i.date).toLocaleDateString()}</td>
                  <td className="p-2">{i.description}</td>
                  <td className="p-2 text-muted-foreground">{i.action_taken ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="w-full text-sm">
            <tbody>
              {records?.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 text-muted-foreground">{new Date(r.occurred_at).toLocaleDateString()}</td>
                  <td className="p-2"><Badge variant={r.category === "COMMENDATION" ? "default" : "outline"}>{r.category}</Badge></td>
                  <td className="p-2">{r.description}</td>
                  <td className="p-2 text-muted-foreground">{r.action_taken ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
