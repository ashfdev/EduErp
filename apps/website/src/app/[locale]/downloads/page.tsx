"use client";

import { useTranslations } from "next-intl";
import { useContent } from "@/hooks/use-content";
import type { DownloadItem } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

const CATEGORIES = ["SYLLABUS", "EXAM_SCHEDULE", "CLASS_ROUTINE", "ACADEMIC_CALENDAR", "FORMS", "RESULTS", "CIRCULARS", "OTHERS"];

export default function DownloadsPage() {
  const t = useTranslations("downloads");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<DownloadItem[]>("/downloads");
  const downloads = data ?? [];

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      {!downloads.length && <p className="text-sm text-gray-500">{t("noFiles")}</p>}
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
                      <p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()} · {t("downloadsCount", { count: d.download_count })}</p>
                    </div>
                    <a href={d.file_url} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">{t("download")}</a>
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
