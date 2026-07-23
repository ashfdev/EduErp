"use client";

import { EVENT_TYPES } from "@education-erp/types";
import type { EventItem } from "@/lib/types";

// Only the shared known-type list gets a real color; anything else falls
// back to neutral gray rather than erroring — Event.type stays a free-form
// string on the schema (see EVENT_TYPES's own comment for why).
const TYPE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  EXAM: { dot: "bg-rose-500", bg: "bg-rose-50", text: "text-rose-700" },
  HOLIDAY: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
  GENERAL: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700" },
  MEETING: { dot: "bg-purple-500", bg: "bg-purple-50", text: "text-purple-700" },
  ADMISSION: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
};
const DEFAULT_COLOR = { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-700" };

export function eventColor(type: string) {
  return TYPE_COLORS[type] ?? DEFAULT_COLOR;
}

export const KNOWN_EVENT_TYPES: readonly string[] = EVENT_TYPES;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthCalendarProps {
  year: number;
  month: number; // 0-11
  events: EventItem[];
  onEventClick?: (event: EventItem) => void;
  // Institution.working_days (JS Date.getDay() values, 0=Sun..6=Sat) that
  // ARE working days — any weekday not in this list gets a muted shade.
  // Display-only; never touches attendance/routine-generation logic, which
  // reads this same field independently.
  workingDays?: number[];
}

export function MonthCalendar({ year, month, events, onEventClick, workingDays }: MonthCalendarProps) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const totalCells = 42; // 6 full weeks, so a month starting on Saturday always fits

  const eventsByDay = new Map<string, EventItem[]>();
  for (const e of events) {
    const from = new Date(e.date_from);
    const to = e.date_to ? new Date(e.date_to) : from;
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cursor <= end) {
      const key = toDateKey(cursor);
      if (!eventsByDay.has(key)) eventsByDay.set(key, []);
      eventsByDay.get(key)!.push(e);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const today = toDateKey(new Date());
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return d;
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] rounded-lg border">
        <div className="grid grid-cols-7 border-b text-xs font-medium text-gray-500">
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={d} className={`p-2 text-center ${workingDays && !workingDays.includes(i) ? "bg-amber-50 text-amber-700" : "bg-gray-50"}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = toDateKey(d);
            const inMonth = d.getMonth() === month;
            const dayEvents = eventsByDay.get(key) ?? [];
            const isToday = key === today;
            const isNonWorking = workingDays && !workingDays.includes(d.getDay());
            return (
              <div
                key={i}
                className={`min-h-[76px] border-b border-r p-1.5 ${inMonth ? (isNonWorking ? "bg-amber-50/50" : "bg-white") : "bg-gray-50"} ${i % 7 === 6 ? "border-r-0" : ""}`}
              >
                <p className={`mb-1 text-xs ${inMonth ? "text-gray-700" : "text-gray-300"} ${isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-white shadow-sm shadow-green-200" : ""}`}>
                  {d.getDate()}
                </p>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => {
                    const color = eventColor(e.type);
                    return (
                      <button
                        key={e.id}
                        onClick={() => onEventClick?.(e)}
                        title={e.name}
                        className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] ${color.bg} ${color.text} hover:opacity-80`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} />
                        <span className="truncate">{e.name}</span>
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <p className="px-1 text-[11px] text-gray-400">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
