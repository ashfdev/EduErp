"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffListItem {
  id: string;
  is_active: boolean;
}
interface LeaveRequestItem {
  id: string;
  status: string;
}

export default function HrDashboardPage() {
  const { data: staff } = useQuery<StaffListItem[]>({ queryKey: ["hr", "staff", "all"], queryFn: async () => (await api.get("/api/hr/staff", { params: { limit: 100 } })).data.data });
  const { data: pendingLeaves } = useQuery<LeaveRequestItem[]>({ queryKey: ["hr", "leaves", "pending"], queryFn: async () => (await api.get("/api/hr/leaves", { params: { status: "PENDING" } })).data.data });

  const now = new Date();
  const { data: payroll } = useQuery<{ net_salary: number }[]>({
    queryKey: ["hr", "payroll", now.getMonth() + 1, now.getFullYear()],
    queryFn: async () => (await api.get("/api/hr/payroll", { params: { month: now.getMonth() + 1, year: now.getFullYear() } })).data.data,
  });

  const activeStaff = staff?.filter((s) => s.is_active).length ?? 0;
  const payrollTotal = payroll?.reduce((sum, p) => sum + p.net_salary, 0) ?? 0;

  return (
    <PageWrapper>
      <PageHeader
        title="HR & Payroll"
        breadcrumbs={[{ label: "HR" }]}
        action={
          <div className="flex gap-2">
            <Link href="/hr/leave"><Button variant="outline">Leave Requests</Button></Link>
            <Link href="/hr/staff/new"><Button>+ Add Staff</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{staff?.length ?? 0}</p><p className="text-sm text-muted-foreground">Total Staff</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{activeStaff}</p><p className="text-sm text-muted-foreground">Active</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{pendingLeaves?.length ?? 0}</p><p className="text-sm text-muted-foreground">Pending Leave</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">৳{payrollTotal.toLocaleString()}</p><p className="text-sm text-muted-foreground">This Month Payroll</p></CardContent></Card>
        <Card><CardContent className="space-y-1 pt-6 text-center"><Link href="/hr/payroll" className="block text-primary hover:underline">Manage Payroll →</Link><Link href="/hr/attendance" className="block text-primary hover:underline">Employee Attendance →</Link><Link href="/hr/faculty" className="block text-primary hover:underline">Faculty List →</Link><Link href="/hr/staff" className="block text-primary hover:underline">Staff List →</Link><Link href="/hr/appraisals" className="block text-primary hover:underline">Appraisals →</Link><Link href="/hr/jobs" className="block text-primary hover:underline">Job Postings →</Link></CardContent></Card>
      </div>
    </PageWrapper>
  );
}
