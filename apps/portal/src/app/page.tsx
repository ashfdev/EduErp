"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Badge, Card, CardContent, StatusBadge, LoadingSpinner, ErrorState } from "@education-erp/ui";
import {
  BookOpen, Bus, FolderOpen, AlertCircle,
  Users, HelpCircle, FileText, ChevronRight,
  CalendarCheck2, Wallet, Award, BellRing, BookMarked, Armchair, CalendarClock
} from "lucide-react";

interface Dashboard {
  student: { name: string; uid: string; class?: string; section?: string; roll?: string; photo: string | null };
  attendance: { today_status: string; this_month_percentage: number | null; check_in_at: string | null; check_out_at: string | null };
  upcoming_exams: { id: string; name: string; start_date: string | null }[];
  recent_results: { exam_name: string; gpa: number; grade: string }[];
  fee_dues: { total_outstanding: number; next_due_date: string | null; next_due_amount: number | null };
  payment_overview: { tuition_paid: number; exam_paid: number; other_paid: number; fines_paid: number; total_paid: number };
  recent_notices: { id: string; title: string; audience: string; created_at: string }[];
  homework: { pending: number; submitted: number; recent: { id: string; title: string; due_date: string }[] };
}

interface RoutineSlot {
  id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject: { name_en: string } | null;
}

function HomeContent() {
  const { activeStudentId } = useAuthStore();
  const { terms } = useInstitution();
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const tRoutine = useTranslations("routine");

  const { data, isLoading, isError, refetch } = useQuery<Dashboard>({
    queryKey: ["portal", "dashboard", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/dashboard`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  // Same endpoint the full Routine page uses -- reused here (React Query
  // dedupes/caches by queryKey, so this costs nothing extra if that page's
  // own query is already warm) rather than growing /dashboard's own
  // response shape for one widget.
  const { data: routineData } = useQuery<RoutineSlot[]>({
    queryKey: ["portal", "routine", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/routine`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });
  const todayDayOfWeek = new Date().getDay();
  const todaysClasses = (routineData ?? [])
    .filter((s) => s.day_of_week === todayDayOfWeek)
    .sort((a, b) => a.period_no - b.period_no);

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? t("goodMorning") : now.getHours() < 17 ? t("goodAfternoon") : t("goodEvening");

  const quickLinks = [
    { href: "/subjects", icon: BookOpen, label: t("mySubjects", { className: terms.term_class }) },
    { href: "/routine", icon: CalendarClock, label: t("routine") },
    { href: "/seat-plan", icon: Armchair, label: t("seatPlan") },
    { href: "/transport-hostel", icon: Bus, label: t("transportHostel") },
    { href: "/resources", icon: FolderOpen, label: t("resources") },
    { href: "/ptm", icon: Users, label: t("ptm") },
    { href: "/quizzes", icon: HelpCircle, label: t("quizzes") },
    { href: "/document-requests", icon: FileText, label: t("documentRequests") },
    { href: "/complaints", icon: AlertCircle, label: t("complaints") },
  ];

  return (
    <div className="space-y-6 lg:space-y-8 pb-8 lg:pb-0">
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
          {data.student.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.student.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xl font-bold text-primary">
              {data.student.name.charAt(0)}
            </div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{greeting},</p>
          <p className="text-xl font-bold tracking-tight text-foreground line-clamp-2 leading-tight">{data.student.name}</p>
        </div>
        <Link href="/profile" className="flex h-9 items-center rounded-full bg-muted px-4 text-xs font-semibold text-foreground transition-colors hover:bg-secondary">
          {t("viewProfile")}
        </Link>
      </div>

      {/* Class Info & Today's Attendance */}
      <Card className="border-0 bg-forest text-white">
        <CardContent className="flex items-center justify-between p-5">
          <div className="space-y-1">
            <p className="font-semibold">{data.student.class} {data.student.section && `· ${terms.term_section} ${data.student.section}`}</p>
            <p className="text-xs text-white/80">{data.student.roll && `${terms.term_roll} ${data.student.roll}`}</p>
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-medium text-white/80">{t("today")}</p>
            <div className="inline-flex rounded-full bg-white/20 px-2.5 py-1">
              {data.attendance.today_status === "NOT_MARKED" ? (
                <Badge variant="outline" className="border-white/40 text-white">{t("attendanceNotMarked")}</Badge>
              ) : (
                <StatusBadge status={data.attendance.today_status} />
              )}
            </div>
            {(data.attendance.check_in_at || data.attendance.check_out_at) && (
              <p className="mt-1 text-[11px] text-white/80">
                {data.attendance.check_in_at && `In ${new Date(data.attendance.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                {data.attendance.check_in_at && data.attendance.check_out_at && " · "}
                {data.attendance.check_out_at && `Out ${new Date(data.attendance.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        {[
          { icon: CalendarCheck2, label: t("thisMonth"), value: `${data.attendance.this_month_percentage ?? "-"}%`, alert: false },
          { icon: Wallet, label: t("outstanding"), value: `৳${data.fee_dues.total_outstanding}`, alert: data.fee_dues.total_outstanding > 0 },
          { icon: Award, label: t("results"), value: String(data.recent_results.length), alert: false },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <stat.icon className="h-4 w-4 shrink-0" />
                <p className="truncate text-xs font-semibold">{stat.label}</p>
              </div>
              <p className={`text-xl font-bold lg:text-2xl ${stat.alert ? "text-ember" : "text-forest"}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment Overview */}
      {data.payment_overview.total_paid > 0 && (
        <Card className="border-border">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">{t("paymentOverview")}</h3>
                <p className="text-xs text-muted-foreground">{t("paymentOverviewHint")}</p>
              </div>
              <p className="text-right">
                <span className="block text-lg font-bold text-foreground">৳{data.payment_overview.total_paid}</span>
                <span className="text-[10px] font-medium text-muted-foreground">{t("totalPaid")}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-base font-bold text-foreground">৳{data.payment_overview.tuition_paid}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{t("tuitionPaid")}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-base font-bold text-foreground">৳{data.payment_overview.exam_paid}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{t("examPaid")}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-base font-bold text-foreground">৳{data.payment_overview.other_paid}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{t("otherPaid")}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-base font-bold text-rose-600">৳{data.payment_overview.fines_paid}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{t("finesPaid")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links Grid (Full Width) */}
      <div>
        <h3 className="mb-3 px-1 text-sm font-semibold tracking-tight text-foreground">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3 lg:gap-4">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="h-full transition-colors hover:border-forest/30 hover:bg-accent">
                <CardContent className="flex flex-col items-start gap-3 p-4">
                  <div className="rounded-lg bg-lime/40 p-2.5 text-forest">
                    <link.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground leading-tight">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content Grid for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <div className="space-y-6 lg:space-y-8">
          {/* Today's Classes */}
          <div>
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{t("todaysClasses")}</h3>
              <Link href="/routine" className="-mr-2 flex min-h-[40px] items-center rounded-md px-2 text-xs font-medium text-primary hover:bg-accent">
                {t("viewFullRoutine")}
              </Link>
            </div>
            <Card className="border-0">
              <CardContent className="p-0">
                {!todaysClasses.length && <p className="p-5 text-sm text-muted-foreground">{tRoutine("noClasses")}</p>}
                {todaysClasses.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between p-4 ${i !== todaysClasses.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-lime/25 text-forest">
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.subject?.name_en ?? tRoutine("freePeriod")}</p>
                        <p className="text-xs text-muted-foreground">{tRoutine("period", { no: s.period_no })}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.start_time} – {s.end_time}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Exams */}
          {!!data.upcoming_exams.length && (
        <div>
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">{t("upcomingExams")}</h3>
          </div>
          <div className="space-y-3">
            {data.upcoming_exams.map((e) => {
              const days = e.start_date ? Math.ceil((new Date(e.start_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <Card key={e.id} className="border-0">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <span className="text-[10px] font-bold uppercase">{e.start_date ? new Date(e.start_date).toLocaleString('default', { month: 'short' }) : '-'}</span>
                        <span className="text-sm font-bold leading-none">{e.start_date ? new Date(e.start_date).getDate() : '-'}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{e.name}</p>
                        {days !== null && <p className="text-xs text-muted-foreground">{days > 0 ? t("inDays", { days }) : t("todayLabel")}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/admit-card/${e.id}`} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary">
                        {t("admitCard")}
                      </Link>
                      <Link href="/seat-plan" className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary">
                        {t("seatPlanLink")}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Homework Due */}
      <Card className="border-0 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <BookMarked className="w-24 h-24" />
        </div>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold tracking-tight text-foreground">{t("homeworkDue")}</h3>
            <Link href="/homework" className="-mr-2 flex min-h-[40px] items-center rounded-md px-2 text-xs font-medium text-primary hover:bg-accent">
              {t("view")} <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-primary">{data.homework.pending}</span>
            <span className="mb-1 text-sm font-medium text-muted-foreground">{t("pendingCount", { count: "" }).trim()}</span>
          </div>
        </CardContent>
      </Card>

    </div>
    
    <div className="space-y-6 lg:space-y-8">

      {/* Recent Notices */}
      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{t("recentNotices")}</h3>
          <Link href="/notices" className="-mr-2 flex min-h-[40px] items-center rounded-md px-2 text-xs font-medium text-primary hover:bg-accent">
            {t("viewAll")} <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
        <Card className="border-0">
          <CardContent className="p-0">
            {!data.recent_notices.length && <p className="p-5 text-sm text-muted-foreground">{t("noNotices")}</p>}
            {data.recent_notices.map((n, i) => (
              <Link
                key={n.id}
                href={`/notices/${n.id}`}
                className={`flex gap-3 p-4 transition-colors hover:bg-muted/50 ${i !== data.recent_notices.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="mt-0.5 rounded-full bg-forest/5 p-1.5 text-forest">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground leading-snug">{n.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
    </div>
      </div>
    </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <PortalShell>
      <HomeContent />
    </PortalShell>
  );
}
