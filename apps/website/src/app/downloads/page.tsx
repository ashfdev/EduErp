"use client";

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/content-api";
import type { DownloadItem } from "@/lib/types";

const CATEGORIES = ["SYLLABUS", "EXAM_SCHEDULE", "FORMS", "RESULTS", "CIRCULARS", "OTHERS"];

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  useEffect(() => {
    fetchContent<DownloadItem[]>("/downloads").then((d) => setDownloads(d ?? []));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Downloads</h1>
      {!downloads.length && <p className="text-sm text-gray-500">No files published yet.</p>}
      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const items = downloads.filter((d) => d.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <h2 className="mb-2 text-lg font-semibold">{cat.replace(/_/g, " ")}</h2>
              <div className="divide-y rounded-lg border">
                {items.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()} · {d.download_count} downloads</p>
                    </div>
                    <a href={d.file_url} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Download</a>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
