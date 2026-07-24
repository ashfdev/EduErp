"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchContent } from "@/lib/content-api";
import type { ClassPicker, RoutineSlotItem } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { Clock, CalendarDays, BookOpen, User, ChevronRight, Loader2 } from "lucide-react";

const DAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

const DAY_COLORS = [
  "from-orange-50 to-orange-100 text-orange-700",
  "from-blue-50 to-blue-100 text-blue-700",
  "from-green-50 to-green-100 text-green-700",
  "from-purple-50 to-purple-100 text-purple-700",
  "from-rose-50 to-rose-100 text-rose-700",
  "from-amber-50 to-amber-100 text-amber-700",
  "from-cyan-50 to-cyan-100 text-cyan-700",
];

export default function RoutinePage() {
  const t = useTranslations("routine");
  const tCommon = useTranslations("common");
  const [classes, setClasses] = useState<ClassPicker[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [slots, setSlots] = useState<RoutineSlotItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const today = new Date().getDay();
  const [day, setDay] = useState(today);

  useEffect(() => {
    fetchContent<ClassPicker[]>("/classes").then((d) => setClasses(d ?? [])).catch(() => {});
  }, []);

  const selectedClass = classes.find((c) => c.id === classId);

  useEffect(() => {
    setSectionId("");
    setGroupId("");
    setSlots(null);
    setLoadError(false);
  }, [classId]);

  function loadRoutine() {
    if (!classId) return;
    setLoading(true);
    setLoadError(false);
    const params: Record<string, string> = { class_id: classId };
    if (sectionId) params.section_id = sectionId;
    if (groupId) params.group_id = groupId;
    fetchContent<RoutineSlotItem[]>("/routine", params)
      .then((d) => setSlots(d ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  const daySlots = (slots ?? []).filter((s) => s.day_of_week === day).sort((a, b) => a.period_no - b.period_no);

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-green-600 focus:ring-4 focus:ring-green-600/10 outline-none transition-all appearance-none";
  const labelCls = "mb-1.5 block text-xs font-bold text-slate-500 uppercase tracking-wider";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <CalendarDays className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{t("title")}</h1>
          </div>
          <p className="text-slate-500 text-sm ml-[52px]">{t("subtitle")}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-8">
        {/* Filter Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
          <h2 className="text-base font-bold text-slate-900 mb-5">Select Your Class</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
            <div>
              <label className={labelCls}>{t("class")}</label>
              <select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">{t("selectClass")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("section")}</label>
              <select
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={!selectedClass?.sections.length}
              >
                <option value="">{t("allSections")}</option>
                {selectedClass?.sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("group")}</label>
              <select
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={!selectedClass?.groups.length}
              >
                <option value="">{t("allGroups")}</option>
                {selectedClass?.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name_en}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={loadRoutine}
            disabled={!classId || loading}
            className="flex items-center gap-2 rounded-2xl bg-green-700 px-6 py-3 text-sm font-bold text-white hover:bg-green-800 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-green-200"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}</>
            ) : (
              <><ChevronRight className="h-4 w-4" /> {t("viewRoutine")}</>
            )}
          </button>
        </div>

        {/* Error */}
        {loadError && (
          <div className="mb-8">
            <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={loadRoutine} />
          </div>
        )}

        {/* Results */}
        {slots !== null && (
          <div>
            {/* Day Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
              {DAY_KEYS.map((key, i) => (
                <button
                  key={i}
                  onClick={() => setDay(i)}
                  className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                    i === day
                      ? "bg-green-700 text-white border-green-700 shadow-sm"
                      : i === today
                      ? "bg-white text-green-700 border-green-300"
                      : "bg-white text-slate-600 border-slate-200 hover:border-green-300 hover:text-green-700"
                  }`}
                >
                  {t(key)}
                  {i === today && i !== day && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle" />}
                </button>
              ))}
            </div>

            {/* Period Cards */}
            {!daySlots.length && (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                <CalendarDays className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">{t("noClasses")}</p>
              </div>
            )}

            <div className="space-y-3">
              {daySlots.map((s, idx) => (
                <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-5 flex items-center gap-5">
                  {/* Period Number Badge */}
                  <div className={`shrink-0 h-12 w-12 rounded-2xl bg-gradient-to-br ${DAY_COLORS[day % DAY_COLORS.length]} flex flex-col items-center justify-center`}>
                    <span className="text-[10px] font-bold uppercase opacity-70">P</span>
                    <span className="text-lg font-extrabold leading-none">{s.period_no}</span>
                  </div>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-base mb-1">
                      {s.subject?.name_en ?? t("freePeriod")}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {s.teacher && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <User className="h-3.5 w-3.5" />
                          {s.teacher.name_en}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        {s.start_time} – {s.end_time}
                      </div>
                    </div>
                  </div>

                  {/* Period Label (right) */}
                  <div className="shrink-0 hidden sm:block text-right">
                    <span className="text-xs text-slate-400 font-medium">{t("period", { no: s.period_no })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
