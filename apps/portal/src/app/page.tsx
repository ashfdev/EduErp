"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, StatusBadge, LoadingSpinner } from "@education-erp/ui";
import { 
  BookOpen, Bus, FolderOpen, AlertCircle, 
  Users, HelpCircle, FileText, ChevronRight, 
  CalendarCheck2, Wallet, Award, BellRing, BookMarked
} from "lucide-react";

interface Dashboard {
  student: { name: string; uid: string; class?: string; section?: string; roll?: string; photo: string | null };
  attendance: { today_status: string; this_month_percentage: number | null };
  upcoming_exams: { id: string; name: string; start_date: string | null }[];
  recent_results: { exam_name: string; gpa: number; grade: string }[];
  fee_dues: { total_outstanding: number; next_due_date: string | null; next_due_amount: number | null };
  recent_notices: { id: string; title: string; audience: string; created_at: string }[];
  homework: { pending: number; submitted: number; recent: { id: string; title: string; due_date: string }[] };
}

function HomeContent() {
  const { activeStudentId } = useAuthStore();
  const { terms } = useInstitution();
  const t = useTranslations("home");

  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ["portal", "dashboard", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/dashboard`)).data.data,
    enabled: !!activeStudentId,
  });

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
    { href: "/subjects", icon: BookOpen, label: t("mySubjects", { className: terms.term_class }), color: "text-blue-600", bg: "bg-blue-50" },
    { href: "/transport-hostel", icon: Bus, label: t("transportHostel"), color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/resources", icon: FolderOpen, label: t("resources"), color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/ptm", icon: Users, label: t("ptm"), color: "text-purple-600", bg: "bg-purple-50" },
    { href: "/quizzes", icon: HelpCircle, label: t("quizzes"), color: "text-pink-600", bg: "bg-pink-50" },
    { href: "/document-requests", icon: FileText, label: t("documentRequests"), color: "text-indigo-600", bg: "bg-indigo-50" },
    { href: "/complaints", icon: AlertCircle, label: t("complaints"), color: "text-rose-600", bg: "bg-rose-50" },
  ];

  return (
    <div className="space-y-6 p-4 pb-8">
      {/* Profile Header */}
      <div className="flex items-center gap-4 pt-2">
        <div className="h-14 w-14 overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200">
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
          <p className="text-xl font-bold tracking-tight text-foreground">{data.student.name.split(" ")[0]}</p>
        </div>
        <Link href="/profile" className="flex h-9 items-center rounded-full bg-slate-100 px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200">
          {t("viewProfile")}
        </Link>
      </div>

      {/* Class Info & Today's Attendance */}
      <Card className="border-0 bg-gradient-to-br from-primary to-indigo-700 text-white shadow-md">
        <CardContent className="flex items-center justify-between p-5">
          <div className="space-y-1">
            <p className="font-semibold">{data.student.class} {data.student.section && `· ${terms.term_section} ${data.student.section}`}</p>
            <p className="text-xs text-white/80">{data.student.roll && `${terms.term_roll} ${data.student.roll}`}</p>
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-medium text-white/80">{t("today")}</p>
            <div className="inline-flex rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
              <StatusBadge status={data.attendance.today_status} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 bg-emerald-50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2 rounded-full bg-emerald-100 p-2 text-emerald-600">
              <CalendarCheck2 className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-emerald-700">{data.attendance.this_month_percentage ?? "-"}%</p>
            <p className="text-[10px] font-medium text-emerald-600/80 uppercase tracking-wider">{t("thisMonth")}</p>
          </CardContent>
        </Card>
        
        <Card className="border-0 bg-rose-50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2 rounded-full bg-rose-100 p-2 text-rose-600">
              <Wallet className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-rose-700">৳{data.fee_dues.total_outstanding}</p>
            <p className="text-[10px] font-medium text-rose-600/80 uppercase tracking-wider">{t("outstanding")}</p>
          </CardContent>
        </Card>

        <Card className="border-0 bg-amber-50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2 rounded-full bg-amber-100 p-2 text-amber-600">
              <Award className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-amber-700">{data.recent_results.length}</p>
            <p className="text-[10px] font-medium text-amber-600/80 uppercase tracking-wider">{t("results")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Exams */}
      {!!data.upcoming_exams.length && (
        <div>
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800">{t("upcomingExams")}</h3>
          </div>
          <div className="space-y-3">
            {data.upcoming_exams.map((e) => {
              const days = e.start_date ? Math.ceil((new Date(e.start_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <Card key={e.id} className="border-0 shadow-sm">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <span className="text-[10px] font-bold uppercase">{e.start_date ? new Date(e.start_date).toLocaleString('default', { month: 'short' }) : '-'}</span>
                        <span className="text-sm font-bold leading-none">{e.start_date ? new Date(e.start_date).getDate() : '-'}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{e.name}</p>
                        {days !== null && <p className="text-xs text-muted-foreground">{days > 0 ? t("inDays", { days }) : t("todayLabel")}</p>}
                      </div>
                    </div>
                    <Link href={`/admit-card/${e.id}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-slate-200">
                      {t("admitCard")}
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Homework Due */}
      <Card className="border-0 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <BookMarked className="w-24 h-24" />
        </div>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold tracking-tight text-slate-800">{t("homeworkDue")}</h3>
            <Link href="/homework" className="flex items-center text-xs font-medium text-primary">
              {t("view")} <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-primary">{data.homework.pending}</span>
            <span className="mb-1 text-sm font-medium text-muted-foreground">{t("pendingCount", { count: "" }).trim()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links Grid */}
      <div>
        <h3 className="mb-3 px-1 text-sm font-semibold tracking-tight text-slate-800">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="border-0 shadow-sm transition-shadow hover:shadow-md h-full">
                <CardContent className="flex flex-col items-start gap-3 p-4">
                  <div className={`rounded-xl p-2.5 ${link.bg} ${link.color}`}>
                    <link.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 leading-tight">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Notices */}
      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold tracking-tight text-slate-800">{t("recentNotices")}</h3>
          <Link href="/notices" className="flex items-center text-xs font-medium text-primary">
            {t("viewAll")} <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {!data.recent_notices.length && <p className="p-5 text-sm text-muted-foreground">{t("noNotices")}</p>}
            {data.recent_notices.map((n, i) => (
              <div key={n.id} className={`flex gap-3 p-4 ${i !== data.recent_notices.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="mt-0.5 rounded-full bg-blue-50 p-1.5 text-blue-500">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{n.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
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
