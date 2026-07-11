"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { PageWrapper, PageHeader, Card, CardContent, Button, EmptyState, StatusBadge } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface Overview {
  students: { total: number; active: number; new_this_year: number; today_present: number; today_absent: number; today_percentage: number | null };
  staff: { total: number; active: number; on_leave_today: number; present_today: number };
  finance: { today_collection: number; this_month_collection: number; total_outstanding: number; overdue_invoices: number };
  academic: { active_exams: number; published_results: number; upcoming_events: number };
  library: { books_issued: number; overdue_issues: number };
}
interface AttendanceTrend {
  labels: string[];
  present_percentage: number[];
}
interface FeeCollection {
  daily: { date: string; amount: number }[];
}
interface SubjectPerf {
  subject_name: string;
  average_marks: number;
}
interface Notice {
  id: string;
  title: string;
  audience: string;
  created_at: string;
}
interface RiskStudent {
  student_id: string;
  name_en: string;
  student_uid: string;
  class_name: string | null;
  attendance_percentage: number | null;
  days_overdue: number;
  total_due: number;
  risk_score: number;
}
interface EventItem {
  id: string;
  name: string;
  date_from: string;
}

function riskColor(score: number) {
  if (score >= 40) return "text-red-600";
  if (score >= 20) return "text-orange-600";
  return "text-yellow-600";
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [smsSentIds, setSmsSentIds] = useState<string[]>([]);

  const { data: overview } = useQuery<Overview>({ queryKey: ["analytics", "overview"], queryFn: async () => (await api.get("/api/analytics/overview")).data.data });
  const { data: trend } = useQuery<AttendanceTrend>({ queryKey: ["analytics", "attendance-trend"], queryFn: async () => (await api.get("/api/analytics/attendance-trend")).data.data });
  const { data: notices } = useQuery<Notice[]>({ queryKey: ["website", "notices", "recent"], queryFn: async () => (await api.get("/api/website/notices")).data.data.slice(0, 5) });

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const { data: feeCollection } = useQuery<FeeCollection>({
    queryKey: ["analytics", "fee-collection", from, to],
    queryFn: async () => (await api.get("/api/analytics/fee-collection", { params: { from_date: from, to_date: to } })).data.data,
  });

  const { data: years } = useQuery<{ id: string; is_active: boolean }[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const activeYearId = years?.find((y) => y.is_active)?.id ?? years?.[0]?.id;
  const { data: resultPerf } = useQuery<{ subject_performance: SubjectPerf[] }>({
    queryKey: ["analytics", "result-performance", activeYearId],
    queryFn: async () => (await api.get("/api/analytics/result-performance", { params: { academic_year_id: activeYearId } })).data.data,
    enabled: !!activeYearId,
  });

  const { data: riskStudents } = useQuery<RiskStudent[]>({ queryKey: ["analytics", "defaulters-risk"], queryFn: async () => (await api.get("/api/analytics/defaulters-risk")).data.data });
  const { data: events } = useQuery<EventItem[]>({ queryKey: ["website", "events", "upcoming"], queryFn: async () => (await api.get("/api/website/events")).data.data });

  const smsMutation = useMutation({
    mutationFn: (studentId: string) => api.post(`/api/analytics/defaulters-risk/${studentId}/remind`),
    onSuccess: () => toast.success("Reminder sent to guardian"),
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to send reminder";
      toast.error(message);
    },
  });

  function sendReminder(studentId: string) {
    setSmsSentIds((prev) => [...prev, studentId]);
    smsMutation.mutate(studentId);
  }

  const trendData = trend?.labels.map((label, i) => ({ label, present: trend.present_percentage[i] })) ?? [];
  const feeData = feeCollection?.daily.map((d) => ({ date: d.date.slice(5), amount: d.amount })) ?? [];
  const radarData = resultPerf?.subject_performance.map((s) => ({ subject: s.subject_name, marks: s.average_marks })) ?? [];
  const upcomingEvents = events?.filter((e) => new Date(e.date_from) >= new Date()).slice(0, 5) ?? [];

  return (
    <PageWrapper>
      <PageHeader title="Dashboard" subtitle="Institution Overview" />

      {/* Row 1 — Quick Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">🎓 Total Students</p>
            <p className="text-2xl font-semibold">{overview?.students.total ?? "-"}</p>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="text-emerald-600">Present {overview?.students.today_present ?? 0}</span>
              <span className="text-red-600">Absent {overview?.students.today_absent ?? 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">👨‍🏫 Staff</p>
            <p className="text-2xl font-semibold">{overview?.staff.total ?? "-"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{overview?.staff.on_leave_today ?? 0} on leave today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">💰 Today&apos;s Collection</p>
            <p className="text-2xl font-semibold">৳{overview?.finance.today_collection ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">This month: ৳{overview?.finance.this_month_collection ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">📊 Attendance Today</p>
            <p className="text-2xl font-semibold">{overview?.students.today_percentage ?? "-"}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Attendance Trend + Notices */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Attendance Trend (last 8 weeks)</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="present" stroke="#1a3c4a" strokeWidth={2} name="Present %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Latest Notices</p>
            {!notices?.length && <EmptyState title="No notices yet" />}
            <div className="divide-y">
              {notices?.map((n) => (
                <div key={n.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{n.title}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={n.audience} />
                    <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Fee Collection + Result Performance */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Fee Collection (last 30 days)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={feeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="amount" fill="#2e7d9a" name="Collected (৳)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Subject Performance (latest published exam)</p>
            {!radarData.length ? (
              <EmptyState title="No published exam results yet" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} />
                  <Radar dataKey="marks" stroke="#1a3c4a" fill="#1a3c4a" fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — At-Risk Students */}
      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">At-Risk Students</p>
          {!riskStudents?.length && <EmptyState title="No students currently at risk" />}
          {!!riskStudents?.length && (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Student</th><th className="p-2">Class</th><th className="p-2">Attendance</th><th className="p-2">Days Overdue</th><th className="p-2">Due</th><th className="p-2">Risk</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {riskStudents.slice(0, 10).map((r) => (
                  <tr key={r.student_id} className="border-b">
                    <td className="p-2">{r.name_en} <span className="font-mono text-xs text-muted-foreground">{r.student_uid}</span></td>
                    <td className="p-2">{r.class_name ?? "-"}</td>
                    <td className="p-2">{r.attendance_percentage ?? "-"}%</td>
                    <td className="p-2">{r.days_overdue}</td>
                    <td className="p-2">৳{r.total_due}</td>
                    <td className={`p-2 font-semibold ${riskColor(r.risk_score)}`}>{r.risk_score}</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" disabled={smsSentIds.includes(r.student_id)} onClick={() => sendReminder(r.student_id)}>
                        {smsSentIds.includes(r.student_id) ? "Sent" : "SMS Guardian"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Row 5 — Events + Quick Actions + System Status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Upcoming Events</p>
            {!upcomingEvents.length && <EmptyState title="No upcoming events" />}
            <div className="divide-y">
              {upcomingEvents.map((e) => (
                <div key={e.id} className="py-2 text-sm">
                  <p>{e.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.date_from).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="mb-2 font-medium">Quick Actions</p>
            <Link href="/attendance/mark"><Button variant="outline" className="w-full justify-start">Mark Attendance</Button></Link>
            <Link href="/fees/collect"><Button variant="outline" className="w-full justify-start">Collect Fee</Button></Link>
            <Link href="/website/notices"><Button variant="outline" className="w-full justify-start">Post Notice</Button></Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">System Status</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Active Exams: {overview?.academic.active_exams ?? 0}</p>
              <p>Published Results: {overview?.academic.published_results ?? 0}</p>
              <p>Overdue Invoices: {overview?.finance.overdue_invoices ?? 0}</p>
              <p>Overdue Library Books: {overview?.library.overdue_issues ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role-specific views */}
      {(user?.role === "CLASS_TEACHER" || user?.role === "SUBJECT_TEACHER") && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">My Teaching Overview</p>
            <p className="text-sm text-muted-foreground">
              <Link href="/marks" className="text-primary hover:underline">View my pending mark entries →</Link>
            </p>
            <p className="text-sm text-muted-foreground">
              <Link href="/attendance/mark" className="text-primary hover:underline">Mark today&apos;s attendance →</Link>
            </p>
          </CardContent>
        </Card>
      )}

      {user?.role === "ACCOUNTANT" && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Accountant Overview</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p>Today&apos;s Collection: ৳{overview?.finance.today_collection ?? 0}</p>
              <p>Overdue Invoices: {overview?.finance.overdue_invoices ?? 0} (৳{overview?.finance.total_outstanding ?? 0})</p>
            </div>
            <Link href="/fees/reports" className="mt-2 inline-block text-sm text-primary hover:underline">View Fee Reports →</Link>
          </CardContent>
        </Card>
      )}

      {user?.role === "EXAM_CONTROLLER" && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Exam Controller Overview</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p>Active Exams: {overview?.academic.active_exams ?? 0}</p>
              <p>Published Results: {overview?.academic.published_results ?? 0}</p>
            </div>
            <Link href="/examination" className="mt-2 inline-block text-sm text-primary hover:underline">Manage Examinations →</Link>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
