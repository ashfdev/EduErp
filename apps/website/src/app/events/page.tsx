"use client";

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/content-api";
import type { EventItem } from "@/lib/types";

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    fetchContent<EventItem[]>("/events", { limit: "50" }).then((d) => setEvents(d ?? []));
  }, []);

  const grouped: Record<string, EventItem[]> = {};
  for (const e of events) {
    const key = new Date(e.date_from).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    (grouped[key] ??= []).push(e);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Events & Academic Calendar</h1>
      {!events.length && <p className="text-sm text-gray-500">No events published yet.</p>}
      {Object.entries(grouped).map(([month, items]) => (
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
