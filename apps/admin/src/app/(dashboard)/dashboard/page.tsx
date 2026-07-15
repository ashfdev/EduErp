"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  academic: { active_exams: number; published_results: number; upcoming_events: number; latest_published_exam: { name: string; published_at: string | null } | null };
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
interface EventItem {
  id: string;
  name: string;
  date_from: string;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const t = useTranslations("dashboard");

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

  const { data: events } = useQuery<EventItem[]>({ queryKey: ["website", "events", "upcoming"], queryFn: async () => (await api.get("/api/website/events")).data.data });

  const trendData = trend?.labels.map((label, i) => ({ label, present: trend.present_percentage[i] })) ?? [];
  const feeData = feeCollection?.daily.map((d) => ({ date: d.date.slice(5), amount: d.amount })) ?? [];
  const radarData = resultPerf?.subject_performance.map((s) => ({ subject: s.subject_name, marks: s.average_marks })) ?? [];
  const upcomingEvents = events?.filter((e) => new Date(e.date_from) >= new Date()).slice(0, 5) ?? [];

  return (
    <PageWrapper>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Row 1 — Quick Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("totalStudents")}</p>
            <p className="text-2xl font-semibold">{overview?.students.total ?? "-"}</p>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="text-emerald-600">{t("present", { count: overview?.students.today_present ?? 0 })}</span>
              <span className="text-red-600">{t("absent", { count: overview?.students.today_absent ?? 0 })}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("staff")}</p>
            <p className="text-2xl font-semibold">{overview?.staff.total ?? "-"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("onLeaveToday", { count: overview?.staff.on_leave_today ?? 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("todaysCollection")}</p>
            <p className="text-2xl font-semibold">৳{overview?.finance.today_collection ?? 0}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("thisMonth", { amount: overview?.finance.this_month_collection ?? 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("attendanceToday")}</p>
            <p className="text-2xl font-semibold">{overview?.students.today_percentage ?? "-"}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Attendance Trend + Notices */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("attendanceTrend")}</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="present" stroke="#1a3c4a" strokeWidth={2} name={t("presentPercent")} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("latestNotices")}</p>
            {!notices?.length && <EmptyState title={t("noNotices")} />}
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
            <p className="mb-2 font-medium">{t("feeCollection30")}</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={feeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="amount" fill="#2e7d9a" name={t("collected")} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("subjectPerformance")}</p>
            {!radarData.length ? (
              <EmptyState title={t("noPublishedResults")} />
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

      {/* Row 5 — Events + Quick Actions + System Status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("upcomingEvents")}</p>
            {!upcomingEvents.length && <EmptyState title={t("noUpcomingEvents")} />}
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
            <p className="mb-2 font-medium">{t("quickActions")}</p>
            <Link href="/attendance/mark"><Button variant="outline" className="w-full justify-start">{t("markAttendance")}</Button></Link>
            <Link href="/fees/collect"><Button variant="outline" className="w-full justify-start">{t("collectFee")}</Button></Link>
            <Link href="/website/notices"><Button variant="outline" className="w-full justify-start">{t("postNotice")}</Button></Link>
            <Link href="/students/at-risk"><Button variant="outline" className="w-full justify-start">{t("viewAtRiskStudents")}</Button></Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("systemStatus")}</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>{t("activeExams", { count: overview?.academic.active_exams ?? 0 })}</p>
              <p>{t("publishedResults", { count: overview?.academic.published_results ?? 0 })}</p>
              {overview?.academic.latest_published_exam && (
                <p className="text-xs">
                  {t("latestPublishedExam", {
                    name: overview.academic.latest_published_exam.name,
                    date: overview.academic.latest_published_exam.published_at ? new Date(overview.academic.latest_published_exam.published_at).toLocaleDateString() : "",
                  })}
                </p>
              )}
              <p>{t("overdueInvoices", { count: overview?.finance.overdue_invoices ?? 0 })}</p>
              <p>{t("overdueLibraryBooks", { count: overview?.library.overdue_issues ?? 0 })}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role-specific views */}
      {(user?.role === "CLASS_TEACHER" || user?.role === "SUBJECT_TEACHER") && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("myTeachingOverview")}</p>
            <p className="text-sm text-muted-foreground">
              <Link href="/marks" className="text-primary hover:underline">{t("viewPendingMarkEntries")}</Link>
            </p>
            <p className="text-sm text-muted-foreground">
              <Link href="/attendance/mark" className="text-primary hover:underline">{t("markTodayAttendance")}</Link>
            </p>
          </CardContent>
        </Card>
      )}

      {user?.role === "ACCOUNTANT" && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("accountantOverview")}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p>{t("todaysCollectionLabel", { amount: overview?.finance.today_collection ?? 0 })}</p>
              <p>{t("overdueInvoicesAmount", { count: overview?.finance.overdue_invoices ?? 0, amount: overview?.finance.total_outstanding ?? 0 })}</p>
            </div>
            <Link href="/fees/reports" className="mt-2 inline-block text-sm text-primary hover:underline">{t("viewFeeReports")}</Link>
          </CardContent>
        </Card>
      )}

      {user?.role === "EXAM_CONTROLLER" && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{t("examControllerOverview")}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p>{t("activeExams", { count: overview?.academic.active_exams ?? 0 })}</p>
              <p>{t("publishedResults", { count: overview?.academic.published_results ?? 0 })}</p>
            </div>
            <Link href="/examination" className="mt-2 inline-block text-sm text-primary hover:underline">{t("manageExaminations")}</Link>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
