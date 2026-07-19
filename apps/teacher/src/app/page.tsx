"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, EmptyState, Badge } from "@education-erp/ui";
import { CalendarCheck, BookOpen, Target, Plane, Clock, ArrowRight, Activity } from "lucide-react";
import Link from "next/link";

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
}

type SlotStatus = "upcoming" | "ongoing" | "completed" | "missed";

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

  return (
    <TeacherShell>
      {/* Header Section */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-primary to-blue-500 p-8 text-white shadow-xl shadow-indigo-200">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 -mb-10 h-32 w-32 rounded-full bg-blue-400/20 blur-2xl"></div>
        
        <div className="relative z-10">
          <p className="text-indigo-100 font-medium mb-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {t("welcome", { name: user?.name_en?.split(" ")[0] ?? "" })} 👋
          </h1>
          <p className="mt-2 text-indigo-50 max-w-md text-sm leading-relaxed opacity-90">
            You have {schedule?.length ?? 0} classes scheduled for today. Have a great day ahead!
          </p>
        </div>
        
        <div className="relative z-10 flex gap-3">
          <Link href="/attendance" className="flex items-center gap-2 rounded-xl bg-white/20 backdrop-blur-md px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/30 transition-all border border-white/10">
            <CalendarCheck className="h-4 w-4" />
            Attendance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column (Main Content) */}
        <div className="md:col-span-8 space-y-6">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Classes Today", value: schedule?.length ?? 0, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Pending Leave", value: "1", icon: Plane, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "Active Quizzes", value: "2", icon: Target, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Avg Attendance", value: "94%", icon: Activity, color: "text-purple-600", bg: "bg-purple-50" },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-slate-100/50 hover:shadow-md transition-all">
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${stat.bg} ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <span className="text-2xl font-black text-slate-800">{stat.value}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 text-center">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Today's Classes */}
          <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 px-6 py-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {t("myClassesToday")}
              </h2>
              <Link href="/routine" className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1">
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
                    <div key={s.id} className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-slate-100 p-4 transition-all hover:border-primary/20 hover:bg-indigo-50/30 hover:shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors">
                          <span className="text-xs font-bold uppercase">Period</span>
                          <span className="text-lg font-black leading-none">{s.period_no}</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-base">{s.subject?.name_en ?? t("classFallback")}</p>
                          <p className="text-sm font-medium text-slate-500 mt-0.5">
                            {s.class.name_en}{s.section ? ` • ${s.section.name}` : ""}{s.group ? ` • ${s.group.name_en}` : ""}
                          </p>
                          <Badge variant={STATUS_BADGE_VARIANT[status]} className="mt-1.5">
                            {t(`status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 sm:mt-0 flex items-center sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {s.start_time} - {s.end_time}
                        </div>
                        {status !== "completed" && (
                          <Link href={`/attendance?class=${s.class.name_en}&section=${s.section?.name}`} className="text-xs font-bold text-primary hover:underline mt-2 hidden sm:block">
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
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              ⚡ Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/attendance", icon: CalendarCheck, label: "Attendance", color: "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100" },
                { href: "/marks", icon: BookOpen, label: "Marks Entry", color: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100" },
                { href: "/quizzes", icon: Target, label: "New Quiz", color: "bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-100" },
                { href: "/leave", icon: Plane, label: "Apply Leave", color: "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100" },
              ].map((action, i) => (
                <Link key={i} href={action.href} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${action.color}`}>
                  <action.icon className="h-6 w-6 mb-2" />
                  <span className="text-xs font-bold">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming Quizzes */}
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-500" /> Quizzes
              </h3>
            </div>
            <div className="space-y-3">
              {[
                { title: "Mid-Term Physics", class: "Class 9 - A", date: "Tomorrow, 10:00 AM" },
                { title: "Weekly Math Test", class: "Class 10 - B", date: "Friday, 11:30 AM" }
              ].map((q, i) => (
                <div key={i} className="rounded-xl border border-slate-100 p-3 hover:border-purple-200 transition-colors bg-slate-50/50">
                  <p className="font-bold text-slate-800 text-sm">{q.title}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">{q.class}</p>
                  <p className="text-[10px] font-bold text-purple-600 mt-2 bg-purple-100 px-2 py-0.5 rounded-md inline-block">{q.date}</p>
                </div>
              ))}
              <Link href="/quizzes" className="block text-center text-xs font-bold text-slate-400 hover:text-primary mt-4 transition-colors">
                View All Quizzes
              </Link>
            </div>
          </div>

        </div>
      </div>
    </TeacherShell>
  );
}
