"use client";

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/content-api";
import type { Notice } from "@/lib/types";

const TABS = ["All", "Recent", "PUBLIC", "STUDENTS", "STAFF", "GUARDIANS"];

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [tab, setTab] = useState("All");

  useEffect(() => {
    fetchContent<Notice[]>("/notices", { limit: "100" }).then((d) => setNotices(d ?? []));
  }, []);

  const filtered = notices.filter((n) => {
    if (tab === "All") return true;
    if (tab === "Recent") return Date.now() - new Date(n.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
    return n.audience === tab;
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Notice Board</h1>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 ${tab === t ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="divide-y rounded-lg border">
        {!filtered.length && <p className="p-4 text-sm text-gray-500">No notices found.</p>}
        {filtered.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{n.is_pinned && "📌 "}{n.title}</p>
              <p className="mt-1 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: n.body }} />
              <p className="mt-1 text-xs text-gray-400">{n.publish_at ? new Date(n.publish_at).toLocaleDateString() : ""} · {n.audience}</p>
            </div>
            {n.attachment_url && (
              <a href={n.attachment_url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
                Download
              </a>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
