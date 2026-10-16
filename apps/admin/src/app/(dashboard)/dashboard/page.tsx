"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  LineChart, Line, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { PageWrapper, PageHeader, Card, EmptyState, StatusBadge, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Users, UserCheck, Wallet, Bell, ArrowUpRight, Activity, ClipboardCheck, AlertTriangle, type LucideIcon } from "lucide-react";

// Matches the backend's ANALYTICS_MESSAGE_ROLES gate on /api/analytics/
// defaulters-risk — the at-risk page mixes financial due data with a
// dropout-risk judgment, both leadership/accounts-domain information.
const AT_RISK_VISIBLE_ROLES = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "ACCOUNTANT"];

interface Overview {
  students: {
    total: number; active: number; new_this_year: number; today_present: number; today_absent: number; today_percentage: number | null;
    today_late: number; on_leave_today: number; today_unmarked: number; by_gender: { MALE: number; FEMALE: number; OTHER: number };
  };
  staff: { total: number; active: number; on_leave_today: number; present_today: number; today_absent: number; today_late: number; today_unmarked: number };
  finance: {
    today_collection: number; this_month_collection: number; total_outstanding: number; overdue_invoices: number; current_fund_balance: number;
    today_expense: number; this_month_expense: number;
  };
  academic: { active_exams: number; published_results: number; upcoming_events: number; latest_published_exam: { name: string; published_at: string | null } | null };
  library: { books_issued: number; overdue_issues: number };
  admission: { by_status: Record<string, number> };
  payroll: { salary_disbursed_today: number };
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
  const { data: notices, isLoading: noticesLoading, isError: noticesIsError, error: noticesError, refetch: refetchNotices } = useQuery<Notice[]>({ queryKey: ["website", "notices", "recent"], queryFn: async () => (await api.get("/api/website/notices")).data.data.slice(0, 5) });

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

  const { data: events, isLoading: eventsLoading, isError: eventsIsError, error: eventsError, refetch: refetchEvents } = useQuery<EventItem[]>({ queryKey: ["website", "events", "upcoming"], queryFn: async () => (await api.get("/api/website/events")).data.data });

  const trendData = trend?.labels.map((label, i) => ({ label, present: trend.present_percentage[i] })) ?? [];
  const feeData = feeCollection?.daily.map((d) => ({ date: d.date.slice(5), amount: d.amount })) ?? [];
  const radarData = resultPerf?.subject_performance.map((s) => ({ subject: s.subject_name, marks: s.average_marks })) ?? [];
  const upcomingEvents = events?.filter((e) => new Date(e.date_from) >= new Date()).slice(0, 5) ?? [];

  // Chart colours follow the fixed forest/lime palette (globals.css).
  const FOREST = "#183028";
  const LIME = "#C5E86C";
  const GRID = "#EEEEEE";
  const AXIS = "#6B726E";
  const GENDER_COLORS = [FOREST, LIME, "#B9BDBA"];
  const ADMISSION_COLORS = [FOREST, LIME, "#333333", "#FF5D28", "#B9BDBA", "#7A9A8C"];
  const tooltipStyle = { borderRadius: 6, border: "1px solid #EEEEEE", boxShadow: "none", fontSize: 12 };

  const s = overview?.students;
  const f = overview?.finance;
  const netToday = f ? f.today_collection - f.today_expense : null;
  const netMonth = f ? f.this_month_collection - f.this_month_expense : null;
  const taka = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n < 0 ? "−" : ""}৳${Math.abs(n).toLocaleString("en-US")}`);
  // These strings were written as "Label: {count}" for inline use; drop the trailing colon in label slots.
  const labelOf = (key: "overdueInvoices" | "activeExams" | "publishedResults" | "overdueLibraryBooks") => t(key, { count: "" }).replace(/[:：]\s*$/, "").trim();
  const glance: { label: string; value: string; tone?: "good" | "bad" | "warn" | "muted" }[] = [
    { label: t("staffPresentToday"), value: String(overview?.staff.present_today ?? "—"), tone: "good" },
    { label: t("staffAbsentToday"), value: String(overview?.staff.today_absent ?? "—"), tone: overview?.staff.today_absent ? "bad" : undefined },
    { label: t("staffLateToday"), value: String(overview?.staff.today_late ?? "—"), tone: overview?.staff.today_late ? "warn" : undefined },
    { label: t("staffUnmarkedToday"), value: String(overview?.staff.today_unmarked ?? "—"), tone: "muted" },
    { label: t("studentsLateToday"), value: String(s?.today_late ?? "—"), tone: s?.today_late ? "warn" : undefined },
    { label: t("studentsOnLeaveToday"), value: String(s?.on_leave_today ?? "—") },
    { label: t("studentsUnmarkedToday"), value: String(s?.today_unmarked ?? "—"), tone: "muted" },
    { label: t("todaysExpense"), value: taka(f?.today_expense) },
    { label: t("currentFundBalance"), value: taka(f?.current_fund_balance) },
    { label: t("netPositionToday"), value: taka(netToday), tone: netToday === null ? undefined : netToday >= 0 ? "good" : "bad" },
    { label: t("netPositionMonth"), value: taka(netMonth), tone: netMonth === null ? undefined : netMonth >= 0 ? "good" : "bad" },
    { label: labelOf("overdueInvoices"), value: String(f?.overdue_invoices ?? "—"), tone: f?.overdue_invoices ? "bad" : undefined },
  ];
  const toneClass = { good: "text-emerald-700", bad: "text-red-700", warn: "text-amber-700", muted: "text-muted-foreground" };

  return (
    <PageWrapper>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeroCard tone="dark" label={t("totalStudents")} value={String(s?.total ?? "—")} icon={Users}>
          <Pill tone="dark">{t("present", { count: s?.today_present ?? 0 })}</Pill>
          <Pill tone="dark">{t("absent", { count: s?.today_absent ?? 0 })}</Pill>
          {/* Present+Absent both 0 looks like a broken counter unless it's clear attendance hasn't been marked yet. */}
          {!!s?.today_unmarked && <Pill tone="dark">{t("unmarked", { count: s.today_unmarked })}</Pill>}
        </HeroCard>
        <HeroCard tone="light" label={t("todaysCollection")} value={taka(f?.today_collection ?? 0)} icon={Wallet}>
          <Pill tone="light">{t("thisMonth", { amount: (f?.this_month_collection ?? 0).toLocaleString("en-US") })}</Pill>
        </HeroCard>
        <HeroCard tone="lime" label={t("attendanceToday")} value={s?.today_percentage === null || s?.today_percentage === undefined ? "—" : `${s.today_percentage}%`} icon={Activity}>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-forest/15" role="progressbar" aria-valuenow={s?.today_percentage ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, s?.today_percentage ?? 0)}%` }} />
          </div>
        </HeroCard>
        <HeroCard tone="forest" label={t("staff")} value={String(overview?.staff.total ?? "—")} icon={UserCheck}>
          <Pill tone="dark">{t("onLeaveToday", { count: overview?.staff.on_leave_today ?? 0 })}</Pill>
          {!!overview?.staff.today_unmarked && <Pill tone="dark">{t("unmarked", { count: overview.staff.today_unmarked })}</Pill>}
        </HeroCard>
      </div>

      <Card className="overflow-hidden">
        <PanelHeader title={t("todayAtAGlance")} />
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {glance.map((g) => (
            <div key={g.label} className="bg-card px-4 py-3.5">
              <p className="text-[13px] leading-snug text-muted-foreground">{g.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${g.tone ? toneClass[g.tone] : ""}`}>{g.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title={t("attendanceTrend")} href="/attendance/reports" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 12, fill: AXIS }} domain={[0, 100]} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="present" stroke={FOREST} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5, strokeWidth: 0, fill: FOREST }} name={t("presentPercent")} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title={t("latestNotices")} href="/website/notices" />
          {noticesLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : noticesIsError ? (
            <div className="p-5"><ErrorState title="Failed to load notices" description={extractErrorMessage(noticesError)} retryLabel="Retry" onRetry={() => refetchNotices()} /></div>
          ) : !notices?.length ? (
            <div className="p-5"><EmptyState title={t("noNotices")} /></div>
          ) : (
            <ul className="divide-y">
              {notices.map((n, i) => (
                <li key={n.id} className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-accent">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${["bg-lime text-forest", "bg-secondary text-foreground", "bg-[#333333] text-white"][i % 3]}`}>
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={n.audience} />
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString("en-GB")}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title={t("genderSplit")} href="/students" />
          <div className="p-5">
            {overview && (overview.students.by_gender.MALE + overview.students.by_gender.FEMALE + overview.students.by_gender.OTHER) > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: t("genderMale"), value: overview.students.by_gender.MALE },
                      { name: t("genderFemale"), value: overview.students.by_gender.FEMALE },
                      { name: t("genderOther"), value: overview.students.by_gender.OTHER },
                    ].filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {GENDER_COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center"><EmptyState title={t("noData")} /></div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title={t("admissionStatus")} href="/admission" />
          <div className="p-5">
            {overview && Object.values(overview.admission.by_status).some((v) => v > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={Object.entries(overview.admission.by_status).filter(([, v]) => v > 0).map(([status, value]) => ({ name: status, value }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {Object.keys(overview.admission.by_status).map((_, i) => <Cell key={i} fill={ADMISSION_COLORS[i % ADMISSION_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center"><EmptyState title={t("noData")} /></div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelHeader title={t("feeCollection30")} href="/fees" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={feeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: AXIS }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 12, fill: AXIS }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip cursor={{ fill: "#F1F2F2" }} contentStyle={tooltipStyle} />
                <Bar dataKey="amount" fill={FOREST} radius={[3, 3, 0, 0]} name={t("collected")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title={t("subjectPerformance")} href="/results" />
          <div className="p-5">
            {!radarData.length ? (
              <div className="flex h-[260px] items-center justify-center"><EmptyState title={t("noPublishedResults")} /></div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={GRID} />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: AXIS }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} axisLine={false} />
                  <Radar dataKey="marks" stroke={FOREST} strokeWidth={2} fill={LIME} fillOpacity={0.6} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="overflow-hidden">
          <PanelHeader title={t("upcomingEvents")} href="/website/events" />
          {eventsLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : eventsIsError ? (
            <div className="p-5"><ErrorState title="Failed to load events" description={extractErrorMessage(eventsError)} retryLabel="Retry" onRetry={() => refetchEvents()} /></div>
          ) : !upcomingEvents.length ? (
            <div className="p-5"><EmptyState title={t("noUpcomingEvents")} /></div>
          ) : (
            <ul className="divide-y">
              {upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-secondary leading-none">
                    <span className="text-[10px] font-semibold text-muted-foreground">{new Date(e.date_from).toLocaleString("en-GB", { month: "short" })}</span>
                    <span className="mt-0.5 text-base font-bold tabular-nums">{new Date(e.date_from).getDate()}</span>
                  </span>
                  <p className="text-sm font-medium leading-snug">{e.name}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title={t("quickActions")} />
          <ul className="divide-y">
            {[
              { href: "/attendance/mark", label: t("markAttendance"), icon: ClipboardCheck },
              { href: "/fees/collect", label: t("collectFee"), icon: Wallet },
              { href: "/website/notices", label: t("postNotice"), icon: Bell },
              ...(user?.role && AT_RISK_VISIBLE_ROLES.includes(user.role) ? [{ href: "/students/at-risk", label: t("viewAtRiskStudents"), icon: AlertTriangle }] : []),
            ].map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="flex min-h-[48px] items-center justify-between gap-3 px-5 py-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                  {a.label}
                  <a.icon className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <PanelHeader title={t("systemStatus")} />
          <ul className="divide-y text-sm">
            {[
              { label: labelOf("activeExams"), value: overview?.academic.active_exams ?? 0 },
              { label: labelOf("publishedResults"), value: overview?.academic.published_results ?? 0 },
              { label: labelOf("overdueInvoices"), value: overview?.finance.overdue_invoices ?? 0, alert: true },
              { label: labelOf("overdueLibraryBooks"), value: overview?.library.overdue_issues ?? 0, alert: true },
            ].map((row) => (
              <li key={row.label} className="flex min-h-[48px] items-center justify-between gap-3 px-5 py-3">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`min-w-[2rem] rounded-full px-2.5 py-0.5 text-center font-semibold tabular-nums ${row.alert && row.value > 0 ? "bg-ember text-white" : "bg-secondary"}`}>{row.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageWrapper>
  );
}

function PanelHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b px-5 py-3">
      <p className="text-base font-semibold">{title}</p>
      {href && (
        <Link href={href} aria-label={`Open ${title}`} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

const HERO_TONE = {
  dark: "bg-[#333333] text-white",
  light: "bg-secondary text-foreground",
  lime: "bg-lime text-forest",
  forest: "bg-forest text-white",
};

function HeroCard({ tone, label, value, icon: Icon, children }: { tone: keyof typeof HERO_TONE; label: string; value: string; icon: LucideIcon; children?: React.ReactNode }) {
  const onDark = tone === "dark" || tone === "forest";
  return (
    <div className={`rounded-lg p-5 ${HERO_TONE[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-medium ${onDark ? "text-white/75" : tone === "lime" ? "text-forest/75" : "text-muted-foreground"}`}>{label}</p>
        <Icon className={`h-5 w-5 shrink-0 ${onDark ? "text-lime" : "text-forest"}`} />
      </div>
      <p className="mt-3 text-[32px] font-bold leading-none tabular-nums">{value}</p>
      {children && <div className="mt-4 flex flex-wrap items-center gap-1.5">{children}</div>}
    </div>
  );
}

function Pill({ tone, children }: { tone: "dark" | "light"; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone === "dark" ? "bg-white/10 text-white/85" : "bg-white/70 text-foreground"}`}>{children}</span>;
}
