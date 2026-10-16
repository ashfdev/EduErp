"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, EmptyState, Badge } from "@education-erp/ui";
import { CalendarCheck, ClipboardList, BookOpen, Target, Plane, Clock, ArrowRight, Activity } from "lucide-react";
import Link from "next/link";

interface LeaveRequestRow {
  id: string;
  status: string;
}
interface QuizRow {
  id: string;
  title: string;
  is_published: boolean;
  subject: { name_en: string } | null;
  _count: { questions: number; attempts: number };
}

interface ScheduleSlot {
  id: string;
  period_no: number;
  start_time: string;
  end_time: string;
  class: { name_en: string };
  section: { name: string } | null;
  subject: { name_en: string } | null;
  group: { name_en: string } | null;
  attendance_marked: boolean;
  substituting_for: string | null;
}

type SlotStatus = "upcoming" | "ongoing" | "completed" | "missed";

// Local calendar date as YYYY-MM-DD (never toISOString(), which forces UTC
// and can land on the wrong day near a UTC-day boundary for a non-UTC
// timezone like Bangladesh's UTC+6) — this is what the "Mark Attendance"
// link's date param needs to match what the teacher actually means by
// "today."
function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Missed" only applies to a slot that's actually over with no attendance on
// record — a still-upcoming or currently-running class is never mislabeled
// as missed just because the day hasn't caught up to it yet.
function computeSlotStatus(s: ScheduleSlot, now: Date): SlotStatus {
  const [startH, startM] = s.start_time.split(":").map(Number);
  const [endH, endM] = s.end_time.split(":").map(Number);
  const start = new Date(now);
  start.setHours(startH || 0, startM || 0, 0, 0);
  const end = new Date(now);
  end.setHours(endH || 0, endM || 0, 0, 0);
  if (now < start) return "upcoming";
  if (now <= end) return "ongoing";
  return s.attendance_marked ? "completed" : "missed";
}

const STATUS_BADGE_VARIANT: Record<SlotStatus, "outline" | "default" | "success" | "destructive"> = {
  upcoming: "outline",
  ongoing: "default",
  completed: "success",
  missed: "destructive",
};

export default function TeacherHomePage() {
  const { user } = useAuthStore();
  const t = useTranslations("home");

  const { data: schedule } = useQuery<ScheduleSlot[]>({
    queryKey: ["teacher", "schedule", "today"],
    queryFn: async () => (await api.get("/api/teacher/schedule/today")).data.data,
  });
  // Real counts, matching what /leave and /quizzes themselves already show —
  // this dashboard used to show hardcoded "1"/"2"/"94%" here regardless of
  // the signed-in teacher's actual data.
  const { data: leaves } = useQuery<LeaveRequestRow[]>({
    queryKey: ["hr", "leaves", "me"],
    queryFn: async () => (await api.get("/api/hr/leaves")).data.data,
  });
  const { data: quizzes } = useQuery<QuizRow[]>({
    queryKey: ["quizzes", "quizzes"],
    queryFn: async () => (await api.get("/api/quizzes/quizzes")).data.data,
  });
  const pendingLeaveCount = leaves?.filter((l) => l.status === "PENDING").length ?? 0;
  const publishedQuizzes = quizzes?.filter((q) => q.is_published) ?? [];
  const attendanceMarkedCount = schedule?.filter((s) => s.attendance_marked).length ?? 0;

  return (
    <TeacherShell>
      {/* Header Section */}
      <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 relative overflow-hidden rounded-lg bg-forest p-6 sm:p-8 text-white">
        <div className="relative z-10">
          <p className="text-white/75 font-medium mb-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
            {t("welcome", { name: user?.name_en?.split(" ")[0] ?? "" })} 👋
          </h1>
          <p className="mt-2 text-white/80 max-w-md text-sm leading-relaxed opacity-90">
            You have {schedule?.length ?? 0} classes scheduled for today. Have a great day ahead!
          </p>
        </div>
        
        <div className="relative z-10 flex gap-3">
          <Link href="/attendance/subject" className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/30 transition-all border border-white/10">
            <ClipboardList className="h-4 w-4" />
            Subject Attendance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column (Main Content) */}
        <div className="md:col-span-8 space-y-6">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "Classes Today", value: schedule?.length ?? 0, icon: Clock },
              { label: "Pending Leave", value: pendingLeaveCount, icon: Plane },
              { label: "Active Quizzes", value: publishedQuizzes.length, icon: Target },
              { label: "Marked Today", value: `${attendanceMarkedCount}/${schedule?.length ?? 0}`, icon: Activity },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <stat.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate text-xs font-semibold">{stat.label}</span>
                </div>
                <span className="text-2xl font-bold text-forest">{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Today's Classes */}
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 sm:px-6 py-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {t("myClassesToday")}
              </h2>
              <Link href="/routine" className="-mr-2 flex min-h-[40px] shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-accent">
                View Full Routine <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            
            <div className="p-2 sm:p-4">
              {!schedule?.length && (
                <div className="py-8">
                  <EmptyState title={t("noClassesToday")} />
                </div>
              )}
              <div className="space-y-2">
                {schedule?.map((s) => {
                  const status = computeSlotStatus(s, new Date());
                  return (
                    <div key={s.id} className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-4 transition-all hover:border-primary/20 hover:bg-forest/5">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/50 text-muted-foreground group-hover:bg-primary group-hover:text-white transition-colors">
                          <span className="text-[10px] sm:text-xs font-bold uppercase">Period</span>
                          <span className="text-lg font-bold leading-none">{s.period_no}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-foreground text-base">{s.subject?.name_en ?? t("classFallback")}</p>
                          <p className="text-sm font-medium text-muted-foreground mt-0.5">
                            {s.class.name_en}{s.section ? ` • ${s.section.name}` : ""}{s.group ? ` • ${s.group.name_en}` : ""}
                          </p>
                          <Badge variant={STATUS_BADGE_VARIANT[status]} className="mt-1.5">
                            {t(`status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
                          </Badge>
                          {s.substituting_for && (
                            <Badge variant="warning" className="mt-1.5 ml-1.5">Substituting for {s.substituting_for}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 sm:mt-0 flex items-center gap-3 sm:gap-0 sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-border pt-3 sm:pt-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-lg">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.start_time} - {s.end_time}
                        </div>
                        {/* Was hidden below sm: entirely — the one action a
                            teacher most needs from this card on a phone. A
                            proper tap-sized button there; the original small
                            text link from sm: up. */}
                        {status !== "completed" && (
                          <Link
                            href={`/attendance/subject?routine_slot_id=${s.id}&date=${todayLocalDateString()}`}
                            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground sm:mt-2 sm:block sm:h-auto sm:rounded-none sm:bg-transparent sm:px-0 sm:text-primary sm:hover:underline"
                          >
                            Mark Attendance
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Sidebar Widgets) */}
        <div className="md:col-span-4 space-y-6">
          
          {/* Quick Actions */}
          <div className="rounded-lg border border-border bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-foreground">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/attendance/subject", icon: ClipboardList, label: "Subject Attendance" },
                { href: "/attendance", icon: CalendarCheck, label: "Daily Attendance" },
                { href: "/marks", icon: BookOpen, label: "Marks Entry" },
                { href: "/quizzes", icon: Target, label: "New Quiz" },
                { href: "/leave", icon: Plane, label: "Apply Leave" },
              ].map((action, i) => (
                <Link key={i} href={action.href} className="flex flex-col items-start gap-2 rounded-lg border p-3 text-forest transition-colors hover:border-forest/30 hover:bg-accent">
                  <span className="rounded-md bg-lime/40 p-2"><action.icon className="h-5 w-5" /></span>
                  <span className="text-xs font-semibold leading-snug">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming Quizzes */}
          <div className="rounded-lg border border-border bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Target className="h-4 w-4 text-forest" /> Quizzes
              </h3>
            </div>
            <div className="space-y-3">
              {!publishedQuizzes.length && (
                <p className="text-xs text-muted-foreground text-center py-2">No published quizzes yet.</p>
              )}
              {publishedQuizzes.slice(0, 3).map((q) => (
                <div key={q.id} className="rounded-lg border border-border p-3 hover:border-lime transition-colors bg-muted/50">
                  <p className="font-bold text-foreground text-sm">{q.title}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{q.subject?.name_en ?? ""}</p>
                  <p className="text-[10px] font-bold text-forest mt-2 bg-lime/40 px-2 py-0.5 rounded-md inline-block">
                    {q._count.questions} question{q._count.questions === 1 ? "" : "s"} · {q._count.attempts} attempt{q._count.attempts === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
              <Link href="/quizzes" className="mt-2 flex min-h-[40px] items-center justify-center rounded-md text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-primary">
                View All Quizzes
              </Link>
            </div>
          </div>

        </div>
      </div>
    </TeacherShell>
  );
}
