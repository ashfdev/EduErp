"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
  department: { name_en: string } | null;
  user: { role: string; phone: string; email: string | null };
  salary_structure: { id: string; name: string } | null;
  subject_assignments: { id: string; subject: { name_en: string; code: string } }[];
  leave_requests: { id: string; leave_type: { name: string }; from_date: string; to_date: string; status: string; reason: string }[];
  payroll_records: { id: string; month: number; year: number; net_salary: number; status: string; payslip_url: string | null }[];
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
      </Tabs>

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
