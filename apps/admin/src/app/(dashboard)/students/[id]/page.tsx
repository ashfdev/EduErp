"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Badge,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  EmptyState,
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
  fees: { invoices: { id: string; description: string; amount_due: number; amount_paid: number; fine_amount: number; status: string; due_date: string }[]; outstanding_total: number; paid_total: number };
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: profile, isLoading } = useQuery<StudentProfile>({
    queryKey: ["students", id],
    queryFn: async () => (await api.get(`/api/students/${id}`)).data.data,
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
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
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
                    <tr key={inv.id} className="border-b">
                      <td className="p-2">{inv.description}</td>
                      <td className="p-2">৳{inv.amount_due}</td>
                      <td className="p-2">৳{inv.amount_paid}</td>
                      <td className="p-2">{new Date(inv.due_date).toLocaleDateString()}</td>
                      <td className="p-2"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
