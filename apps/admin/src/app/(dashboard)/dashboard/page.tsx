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
import { Users, UserCheck, Wallet, Calendar, Bell, ArrowUpRight, ArrowDownRight, Activity, ClipboardCheck, AlertTriangle } from "lucide-react";

// Matches the backend's ANALYTICS_MESSAGE_ROLES gate on /api/analytics/
// defaulters-risk — the at-risk page mixes financial due data with a
// dropout-risk judgment, both leadership/accounts-domain information.
const AT_RISK_VISIBLE_ROLES = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "ACCOUNTANT"];

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

  // Theme colors for charts
  const CHART_PRIMARY = "#2563EB"; // Tailwind blue-600
  const CHART_SECONDARY = "#60A5FA"; // Tailwind blue-400

  return (
    <PageWrapper>
      <div className="mb-8">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
      </div>

      {/* Row 1 — Quick Stats */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="border-0 shadow-sm transition-all hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">{t("totalStudents")}</p>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{overview?.students.total ?? "-"}</p>
            <div className="mt-3 flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                <ArrowUpRight className="mr-1 h-3 w-3" />
                {t("present", { count: overview?.students.today_present ?? 0 })}
              </span>
              <span className="flex items-center text-rose-600 bg-rose-50 px-2 py-1 rounded-full">
                <ArrowDownRight className="mr-1 h-3 w-3" />
                {t("absent", { count: overview?.students.today_absent ?? 0 })}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm transition-all hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">{t("staff")}</p>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <UserCheck className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{overview?.staff.total ?? "-"}</p>
            <div className="mt-3 flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center text-muted-foreground bg-slate-100 px-2 py-1 rounded-full">
                {t("onLeaveToday", { count: overview?.staff.on_leave_today ?? 0 })}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm transition-all hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">{t("todaysCollection")}</p>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">৳{overview?.finance.today_collection ?? 0}</p>
            <div className="mt-3 flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center text-muted-foreground bg-slate-100 px-2 py-1 rounded-full">
                {t("thisMonth", { amount: overview?.finance.this_month_collection ?? 0 })}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm transition-all hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">{t("attendanceToday")}</p>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">{overview?.students.today_percentage ?? "-"}%</p>
            <div className="mt-3 flex items-center gap-3 text-xs font-medium">
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                <div 
                  className="bg-amber-500 h-1.5 rounded-full" 
                  style={{ width: `${overview?.students.today_percentage ?? 0}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Attendance Trend + Notices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <p className="font-semibold text-foreground tracking-tight">{t("attendanceTrend")}</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} domain={[0, 100]} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="present" 
                  stroke={CHART_PRIMARY} 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: CHART_PRIMARY }}
                  name={t("presentPercent")} 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <p className="font-semibold text-foreground tracking-tight">{t("latestNotices")}</p>
              <Button variant="ghost" size="sm" asChild className="text-primary">
                <Link href="/website/notices">View All</Link>
              </Button>
            </div>
            {!notices?.length && <EmptyState title={t("noNotices")} />}
            <div className="space-y-4">
              {notices?.map((n) => (
                <div key={n.id} className="group flex items-start gap-4 rounded-xl p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors">{n.title}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <StatusBadge status={n.audience} />
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Fee Collection + Result Performance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="mb-6 font-semibold tracking-tight">{t("feeCollection30")}</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={feeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="amount" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} name={t("collected")} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="mb-6 font-semibold tracking-tight">{t("subjectPerformance")}</p>
            {!radarData.length ? (
              <div className="flex h-[260px] items-center justify-center">
                <EmptyState title={t("noPublishedResults")} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#4B5563' }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} axisLine={false} />
                  <Radar dataKey="marks" stroke={CHART_PRIMARY} strokeWidth={2} fill={CHART_SECONDARY} fillOpacity={0.5} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — Events + Quick Actions + System Status */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <p className="font-semibold tracking-tight">{t("upcomingEvents")}</p>
            </div>
            {!upcomingEvents.length && <EmptyState title={t("noUpcomingEvents")} />}
            <div className="space-y-4">
              {upcomingEvents.map((e) => (
                <div key={e.id} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <span className="text-[10px] font-bold uppercase">{new Date(e.date_from).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-sm font-bold leading-none">{new Date(e.date_from).getDate()}</span>
                  </div>
                  <div className="flex flex-col justify-center py-1">
                    <p className="text-sm font-medium leading-tight">{e.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="mb-6 font-semibold tracking-tight">{t("quickActions")}</p>
            <div className="space-y-3">
              <Button variant="outline" asChild className="w-full justify-start rounded-xl h-11">
                <Link href="/attendance/mark">
                  <ClipboardCheck className="mr-2 h-4 w-4 text-primary" />
                  {t("markAttendance")}
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full justify-start rounded-xl h-11">
                <Link href="/fees/collect">
                  <Wallet className="mr-2 h-4 w-4 text-emerald-600" />
                  {t("collectFee")}
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full justify-start rounded-xl h-11">
                <Link href="/website/notices">
                  <Bell className="mr-2 h-4 w-4 text-amber-500" />
                  {t("postNotice")}
                </Link>
              </Button>
              {user?.role && AT_RISK_VISIBLE_ROLES.includes(user.role) && (
                <Button variant="outline" asChild className="w-full justify-start rounded-xl h-11">
                  <Link href="/students/at-risk">
                    <AlertTriangle className="mr-2 h-4 w-4 text-red-500" />
                    {t("viewAtRiskStudents")}
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="mb-6 font-semibold tracking-tight">{t("systemStatus")}</p>
            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between border-b pb-3">
                <span>{t("activeExams", { count: "" })}</span>
                <span className="font-bold text-foreground bg-slate-100 px-2.5 py-0.5 rounded-full">{overview?.academic.active_exams ?? 0}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-3">
                <span>{t("publishedResults", { count: "" })}</span>
                <span className="font-bold text-foreground bg-slate-100 px-2.5 py-0.5 rounded-full">{overview?.academic.published_results ?? 0}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-3">
                <span>{t("overdueInvoices", { count: "" })}</span>
                <span className="font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">{overview?.finance.overdue_invoices ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("overdueLibraryBooks", { count: "" })}</span>
                <span className="font-bold text-foreground bg-slate-100 px-2.5 py-0.5 rounded-full">{overview?.library.overdue_issues ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
