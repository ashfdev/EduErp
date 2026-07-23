"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchContent } from "@/lib/content-api";
import { useContent } from "@/hooks/use-content";
import type { EventItem, Institution } from "@/lib/types";
import { MonthCalendar, eventColor, KNOWN_EVENT_TYPES } from "@/components/month-calendar";
import { ErrorState } from "@education-erp/ui";
import { Calendar as CalendarIcon, List, ChevronLeft, ChevronRight, CalendarDays, ChevronDown } from "lucide-react";

export default function EventsPage() {
  const t = useTranslations("events");
  const tCommon = useTranslations("common");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [workingDays, setWorkingDays] = useState<number[] | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const { data, error, refetch } = useContent<EventItem[]>("/events", { limit: "200", ...(typeFilter && { type: typeFilter }) });
  const events = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    fetchContent<Institution>("/institution").then((d) => setWorkingDays(d?.working_days ?? null)).catch(() => {});
  }, []);

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

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        
        {/* Header Section */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">{t("title")}</h1>
            <p className="text-slate-500 text-sm max-w-xl">Stay updated with our academic schedule, holidays, and upcoming events.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <select 
                value={typeFilter} 
                onChange={(e) => setTypeFilter(e.target.value)} 
                className="appearance-none rounded-full bg-white border border-slate-200 px-5 py-2.5 pr-10 text-sm font-bold text-slate-700 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all outline-none shadow-sm cursor-pointer min-w-[160px]"
              >
                <option value="">{t("allTypes")}</option>
                {(eventTypesPresent.length ? eventTypesPresent : KNOWN_EVENT_TYPES).map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            
            <div className="flex rounded-full bg-white p-1.5 shadow-sm border border-slate-200">
              <button
                onClick={() => setView("grid")}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-all ${view === "grid" ? "bg-primary text-white shadow-md shadow-primary/20" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
              >
                <CalendarIcon className="h-4 w-4" /> {t("calendar")}
              </button>
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-all ${view === "list" ? "bg-primary text-white shadow-md shadow-primary/20" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
              >
                <List className="h-4 w-4" /> {t("list")}
              </button>
            </div>
          </div>
        </div>

        {!events.length && (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 text-center ring-1 ring-slate-100 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Events Found</h3>
            <p className="text-slate-500 text-sm">{t("noEvents")}</p>
          </div>
        )}

        {!!events.length && view === "grid" && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => shiftMonth(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-bold text-slate-900">{monthLabel}</h2>
              <button onClick={() => shiftMonth(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            
            <MonthCalendar year={cursor.year} month={cursor.month} events={events} workingDays={workingDays ?? undefined} />
            
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap gap-4 text-xs font-semibold text-slate-600 justify-center">
              {(eventTypesPresent.length ? eventTypesPresent : KNOWN_EVENT_TYPES).map((et) => (
                <span key={et} className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                  <span className={`h-2.5 w-2.5 rounded-full ${eventColor(et).dot}`} />
                  {et}
                </span>
              ))}
            </div>
          </div>
        )}

        {!!events.length && view === "list" && (
          <div className="space-y-8">
            {Object.entries(grouped).map(([month, items]) => (
              <div key={month}>
                <div className="flex items-center gap-4 mb-4">
                  <h2 className="text-lg font-bold text-slate-900">{month}</h2>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map((e) => (
                    <div key={e.id} className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 className="font-bold text-slate-900 text-base">{e.name}</h3>
                        <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">{e.type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-primary font-semibold mb-3">
                        <CalendarDays className="h-4 w-4" />
                        {new Date(e.date_from).toLocaleDateString()}
                        {e.date_to && ` – ${new Date(e.date_to).toLocaleDateString()}`}
                      </div>
                      {e.description && <p className="text-sm text-slate-600 leading-relaxed">{e.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
