"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchContent } from "@/lib/content-api";
import type { ClassPicker, RoutineSlotItem } from "@/lib/types";

const DAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

export default function RoutinePage() {
  const t = useTranslations("routine");
  const [classes, setClasses] = useState<ClassPicker[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [slots, setSlots] = useState<RoutineSlotItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const today = new Date().getDay();
  const [day, setDay] = useState(today);

  useEffect(() => {
    fetchContent<ClassPicker[]>("/classes").then((d) => setClasses(d ?? []));
  }, []);

  const selectedClass = classes.find((c) => c.id === classId);

  useEffect(() => {
    setSectionId("");
    setGroupId("");
    setSlots(null);
  }, [classId]);

  function loadRoutine() {
    if (!classId) return;
    setLoading(true);
    const params: Record<string, string> = { class_id: classId };
    if (sectionId) params.section_id = sectionId;
    if (groupId) params.group_id = groupId;
    fetchContent<RoutineSlotItem[]>("/routine", params).then((d) => {
      setSlots(d ?? []);
      setLoading(false);
    });
  }

  const daySlots = (slots ?? []).filter((s) => s.day_of_week === day).sort((a, b) => a.period_no - b.period_no);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-500">{t("subtitle")}</p>

      <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t("class")}</label>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">{t("selectClass")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name_en}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t("section")}</label>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50"
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
          <label className="mb-1 block text-xs font-medium text-gray-500">{t("group")}</label>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50"
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
        className="mt-3 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ background: "var(--primary)" }}
      >
        {loading ? t("loading") : t("viewRoutine")}
      </button>

      {slots !== null && (
        <div className="mt-8">
          <div className="flex gap-1 overflow-x-auto">
            {DAY_KEYS.map((key, i) => (
              <button
                key={i}
                onClick={() => setDay(i)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${i === day ? "text-white" : "bg-gray-100 text-gray-700"} ${i === today ? "ring-2" : ""}`}
                style={i === day ? { background: "var(--primary)" } : i === today ? { boxShadow: "0 0 0 2px var(--primary)" } : undefined}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {!daySlots.length && <p className="text-sm text-gray-500">{t("noClasses")}</p>}
            {daySlots.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{s.subject?.name_en ?? t("freePeriod")}</p>
                  <p className="text-xs text-gray-500">
                    {t("period", { no: s.period_no })}{s.teacher ? ` · ${s.teacher.name_en}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-gray-500">{s.start_time} – {s.end_time}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
