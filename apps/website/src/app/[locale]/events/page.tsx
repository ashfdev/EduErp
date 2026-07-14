"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchContent } from "@/lib/content-api";
import type { EventItem } from "@/lib/types";
import { MonthCalendar, eventColor, KNOWN_EVENT_TYPES } from "@/components/month-calendar";

export default function EventsPage() {
  const t = useTranslations("events");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    fetchContent<EventItem[]>("/events", { limit: "200", ...(typeFilter && { type: typeFilter }) }).then((d) => setEvents(d ?? []));
  }, [typeFilter]);

  const eventTypesPresent = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);

  const grouped: Record<string, EventItem[]> = {};
  for (const e of events) {
    const key = new Date(e.date_from).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    (grouped[key] ??= []).push(e);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-md border px-2 py-1 text-sm">
            <option value="">{t("allTypes")}</option>
            {(eventTypesPresent.length ? eventTypesPresent : KNOWN_EVENT_TYPES).map((et) => (
              <option key={et} value={et}>{et}</option>
            ))}
          </select>
          <div className="flex rounded-md border text-sm">
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1 ${view === "grid" ? "bg-blue-600 text-white" : "text-gray-600"}`}
            >
              {t("calendar")}
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1 ${view === "list" ? "bg-blue-600 text-white" : "text-gray-600"}`}
            >
              {t("list")}
            </button>
          </div>
        </div>
      </div>

      {!events.length && <p className="text-sm text-gray-500">{t("noEvents")}</p>}

      {!!events.length && view === "grid" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => shiftMonth(-1)} className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50">{t("prev")}</button>
            <p className="font-medium">{monthLabel}</p>
            <button onClick={() => shiftMonth(1)} className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50">{t("next")}</button>
          </div>
          <MonthCalendar year={cursor.year} month={cursor.month} events={events} />
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-gray-600">
            {(eventTypesPresent.length ? eventTypesPresent : KNOWN_EVENT_TYPES).map((et) => (
              <span key={et} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${eventColor(et).dot}`} />
                {et}
              </span>
            ))}
          </div>
        </div>
      )}

      {!!events.length && view === "list" && Object.entries(grouped).map(([month, items]) => (
        <div key={month} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{month}</h2>
          <div className="divide-y rounded-lg border">
            {items.map((e) => (
              <div key={e.id} className="p-3">
                <p className="text-sm font-medium">{e.name}</p>
                <p className="text-xs text-gray-500">
                  {new Date(e.date_from).toLocaleDateString()}
                  {e.date_to && ` – ${new Date(e.date_to).toLocaleDateString()}`} · {e.type}
                </p>
                {e.description && <p className="mt-1 text-sm text-gray-600">{e.description}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
