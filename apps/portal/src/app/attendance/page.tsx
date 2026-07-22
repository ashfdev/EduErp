"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState } from "@education-erp/ui";

interface AttendanceRecord {
  date: string;
  status: string;
}
interface SubjectAttendanceSummary {
  overall: { present: number; total: number; percentage: number };
  subjects: { subject_id: string; subject_name_en: string; present: number; total: number; percentage: number }[];
}

import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, XCircle, Clock, AlertCircle, type LucideIcon } from "lucide-react";

const STATUS_STYLES: Record<string, { bg: string, text: string, label: string, icon: LucideIcon }> = {
  PRESENT: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Present", icon: CheckCircle2 },
  ABSENT: { bg: "bg-rose-100", text: "text-rose-700", label: "Absent", icon: XCircle },
  LATE: { bg: "bg-amber-100", text: "text-amber-700", label: "Late", icon: Clock },
  LEAVE: { bg: "bg-blue-100", text: "text-blue-700", label: "Leave", icon: AlertCircle },
  HALF_DAY: { bg: "bg-purple-100", text: "text-purple-700", label: "Half Day", icon: AlertCircle },
};

function AttendanceContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("attendance");
  const tCommon = useTranslations("common");
  const [tab, setTab] = useState<"monthly" | "yearly" | "subjects">("monthly");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading, isError, refetch } = useQuery<AttendanceRecord[]>({
    queryKey: ["portal", "attendance", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/attendance`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  // Real subject-wise attendance — "how attendance is actually taken" is
  // still the classic daily calendar above (that's what a teacher marks
  // today); this is the newer, class-period-level breakdown, shown as its
  // own tab rather than replacing the calendar.
  const { data: subjectSummary } = useQuery<SubjectAttendanceSummary>({
    queryKey: ["portal", "subject-attendance", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/subject-attendance`)).data.data,
    enabled: !!activeStudentId && tab === "subjects",
  });

  const monthRecords = useMemo(() => (data ?? []).filter((r) => { const d = new Date(r.date); return d.getMonth() === month && d.getFullYear() === year; }), [data, month, year]);
  const byDay = useMemo(() => new Map(monthRecords.map((r) => [new Date(r.date).getDate(), r.status])), [monthRecords]);
  
  // Calculate first day of month (0 = Sun, 1 = Mon...)
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const summary = {
    P: monthRecords.filter((r) => r.status === "PRESENT").length,
    A: monthRecords.filter((r) => r.status === "ABSENT").length,
    L: monthRecords.filter((r) => r.status === "LATE" || r.status === "LEAVE").length,
    total: monthRecords.length,
  };

  const monthlyStats = useMemo(() => {
    const map = new Map<string, { present: number; total: number }>();
    for (const r of data ?? []) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const entry = map.get(key) ?? { present: 0, total: 0 };
      entry.total++;
      if (r.status === "PRESENT") entry.present++;
      map.set(key, entry);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [data]);

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  const percentage = summary.total ? Math.round((summary.P / summary.total) * 100) : 0;

  return (
    <div className="space-y-6 lg:space-y-8 max-w-5xl mx-auto w-full lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-2.5 text-purple-600">
            <CalendarDays className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-full w-max">
          <button onClick={() => setTab("monthly")} className={`rounded-full px-5 py-2 text-xs font-bold transition-all ${tab === "monthly" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t("monthly")}
          </button>
          <button onClick={() => setTab("yearly")} className={`rounded-full px-5 py-2 text-xs font-bold transition-all ${tab === "yearly" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t("yearly")}
          </button>
          <button onClick={() => setTab("subjects")} className={`rounded-full px-5 py-2 text-xs font-bold transition-all ${tab === "subjects" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            By Subject
          </button>
        </div>
      </div>

      {tab === "monthly" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-3 space-y-6">
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between bg-primary p-4 sm:p-6 text-primary-foreground">
                  <button onClick={() => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <p className="text-xl font-bold tracking-wide">{new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                  <button onClick={() => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
                
                <div className="p-4 sm:p-6 bg-white">
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center mb-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                      <div key={d} className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider py-2">{d}</div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
                    {/* Empty slots for start of month */}
                    {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square"></div>
                    ))}
                    
                    {/* Actual days */}
                    {daysArray.map((day) => {
                      const status = byDay.get(day);
                      const style = status ? STATUS_STYLES[status] : null;
                      const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                      
                      return (
                        <div key={day} className="aspect-square relative p-0.5 sm:p-1">
                          <div className={`w-full h-full flex flex-col items-center justify-center rounded-xl transition-all ${
                            style ? style.bg : "bg-slate-50 text-slate-400"
                          } ${isToday ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                            <span className={`text-sm sm:text-lg font-bold ${style ? style.text : ''}`}>{day}</span>
                            {style && (
                              <div className="block absolute bottom-1 text-[8px] font-bold uppercase tracking-wider opacity-70">
                                {style.label.substring(0,3)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">Monthly Summary</h3>
            
            <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 font-medium text-sm">Attendance Rate</p>
                  <p className="text-4xl font-bold mt-1">{percentage}%</p>
                </div>
                <div className="h-16 w-16 rounded-full bg-emerald-400/30 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-100" />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="border-0 shadow-sm bg-emerald-50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{summary.P}</p>
                  <p className="text-xs font-bold text-emerald-600/70 uppercase tracking-wider mt-1">{t("present")}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-rose-50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-rose-700">{summary.A}</p>
                  <p className="text-xs font-bold text-rose-600/70 uppercase tracking-wider mt-1">{t("absent")}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-amber-50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{summary.L}</p>
                  <p className="text-xs font-bold text-amber-600/70 uppercase tracking-wider mt-1">{t("late")}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-slate-50">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-slate-700">{summary.total}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{t("total")}</p>
                </CardContent>
              </Card>
            </div>
            
            <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-white">
               <p className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">Legend</p>
               <div className="flex flex-wrap gap-x-2 gap-y-1.5 sm:gap-x-3 sm:gap-y-2">
                 {Object.values(STATUS_STYLES).map(s => (
                   <div key={s.label} className="flex items-center gap-1.5">
                     <div className={`h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full ${s.bg}`}></div>
                     <span className="text-[10px] sm:text-xs font-medium text-slate-600 whitespace-nowrap">{s.label}</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      )}

      {tab === "yearly" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {!monthlyStats.length && <p className="col-span-full text-slate-500 p-8 text-center bg-slate-50 rounded-2xl border border-dashed">No data available for this year.</p>}
          {monthlyStats.map(([key, stat]) => {
            const [y, m] = key.split("-").map(Number);
            const rate = stat.total ? Math.round((stat.present / stat.total) * 100) : 0;
            return (
              <Card key={key} className="border-0 shadow-sm">
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                        {new Date(y!, m!).toLocaleDateString("en-US", { month: "short" })}
                     </div>
                     <span className="font-bold text-slate-700">{y}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-bold ${rate >= 90 ? 'text-emerald-600' : rate >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>{rate}%</span>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Rate</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "subjects" && (
        <div className="space-y-4">
          {!subjectSummary && <div className="flex justify-center p-8"><LoadingSpinner /></div>}
          {subjectSummary && !subjectSummary.subjects.length && (
            <p className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-slate-500">
              No subject-wise attendance recorded yet this year.
            </p>
          )}
          {subjectSummary && !!subjectSummary.subjects.length && (
            <>
              <Card className="border-0 shadow-sm bg-gradient-to-br from-primary to-indigo-600 text-white">
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <p className="text-sm font-medium text-white/80">Overall (this year, all subjects)</p>
                    <p className="mt-1 text-4xl font-bold">{subjectSummary.overall.percentage}%</p>
                  </div>
                  <p className="text-sm text-white/80">{subjectSummary.overall.present} / {subjectSummary.overall.total} sessions</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subjectSummary.subjects.map((s) => (
                  <Card key={s.subject_id} className="border-0 shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-bold text-slate-800">{s.subject_name_en}</p>
                        <p className="text-xs text-slate-500">{s.present} / {s.total} sessions</p>
                      </div>
                      <span className={`text-xl font-bold ${s.percentage >= 90 ? "text-emerald-600" : s.percentage >= 75 ? "text-amber-500" : "text-rose-500"}`}>{s.percentage}%</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <PortalShell>
      <AttendanceContent />
    </PortalShell>
  );
}
