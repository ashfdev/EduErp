"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchContent, API_URL } from "@/lib/content-api";
import type { Notice } from "@/lib/types";
import { PdfPreviewModal } from "@education-erp/ui";

const TAB_KEYS = ["tabAll", "tabRecent", "tabPublic", "tabStudents", "tabStaff", "tabGuardians"] as const;
const TAB_FILTER_VALUES = ["All", "Recent", "PUBLIC", "STUDENTS", "STAFF", "GUARDIANS"] as const;

export default function NoticesPage() {
  const t = useTranslations("notices");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [tab, setTab] = useState<(typeof TAB_FILTER_VALUES)[number]>("All");
  const [previewNotice, setPreviewNotice] = useState<Notice | null>(null);

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
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {TAB_FILTER_VALUES.map((val, i) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={`rounded-full px-3 py-1 ${tab === val ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {t(TAB_KEYS[i])}
          </button>
        ))}
      </div>
      <div className="divide-y rounded-lg border">
        {!filtered.length && <p className="p-4 text-sm text-gray-500">{t("noNotices")}</p>}
        {filtered.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{n.is_pinned && "📌 "}{n.title}</p>
              <p className="mt-1 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: n.body }} />
              <p className="mt-1 text-xs text-gray-400">{n.publish_at ? new Date(n.publish_at).toLocaleDateString() : ""} · {n.audience}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewNotice(n)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {t("viewPdf")}
              </button>
              {n.attachment_url && (
                <a href={n.attachment_url} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
                  {t("download")}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <PdfPreviewModal
        open={!!previewNotice}
        onOpenChange={(open) => !open && setPreviewNotice(null)}
        title={previewNotice?.title ?? ""}
        pdfUrl={previewNotice ? `${API_URL}/api/content/notices/${previewNotice.id}/pdf` : null}
        downloadLabel={t("download")}
        closeLabel={t("closePreview")}
      />
    </main>
  );
}
