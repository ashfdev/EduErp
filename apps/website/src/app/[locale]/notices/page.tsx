"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_URL } from "@/lib/content-api";
import { useContent } from "@/hooks/use-content";
import type { Notice } from "@/lib/types";
import { PdfPreviewModal, ErrorState } from "@education-erp/ui";
import { markNoticesVisited } from "@/lib/notices-visit";
import { Pin, FileText, Download, Eye, Calendar, Bell } from "lucide-react";

const TAB_KEYS = ["tabAll", "tabRecent", "tabPublic", "tabStudents", "tabStaff", "tabGuardians"] as const;
const TAB_FILTER_VALUES = ["All", "Recent", "PUBLIC", "STUDENTS", "STAFF", "GUARDIANS"] as const;

export default function NoticesPage() {
  const t = useTranslations("notices");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<Notice[]>("/notices", { limit: "100" });
  const notices = data ?? [];
  const [tab, setTab] = useState<(typeof TAB_FILTER_VALUES)[number]>("All");
  const [previewNotice, setPreviewNotice] = useState<Notice | null>(null);

  useEffect(() => {
    markNoticesVisited();
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  const filtered = notices.filter((n) => {
    if (tab === "All") return true;
    if (tab === "Recent") return Date.now() - new Date(n.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
    return n.audience === tab;
  });

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
        
        {/* Header section */}
        <div className="mb-10 text-center max-w-2xl mx-auto">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4 ring-4 ring-primary/5">
            <Bell className="h-6 w-6" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">{t("title")}</h1>
          <p className="text-slate-500 text-base">Stay up to date with the latest announcements, schedules, and important information.</p>
        </div>

        {/* Tabs Filter */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {TAB_FILTER_VALUES.map((val, i) => (
            <button
              key={val}
              onClick={() => setTab(val)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
                tab === val 
                  ? "bg-primary text-white shadow-md shadow-primary/20 scale-105" 
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 ring-1 ring-slate-200"
              }`}
            >
              {t(TAB_KEYS[i])}
            </button>
          ))}
        </div>

        {/* Notices List */}
        {!filtered.length && (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 text-center ring-1 ring-slate-100 shadow-sm mt-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4">
              <FileText className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Notices Found</h3>
            <p className="text-slate-500 text-sm">{t("noNotices")}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {filtered.map((n) => (
            <div key={n.id} className="group flex flex-col sm:flex-row gap-5 rounded-2xl bg-white p-6 ring-1 ring-slate-100 shadow-sm transition-all hover:shadow-md hover:ring-primary/20">
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-2">
                  {n.is_pinned && (
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-orange-100 text-orange-600 shrink-0" title="Pinned Notice">
                      <Pin className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <h3 className={`text-lg font-bold ${n.is_pinned ? "text-slate-900" : "text-slate-800"} group-hover:text-primary transition-colors`}>
                    {n.title}
                  </h3>
                </div>
                
                <div className="prose prose-sm prose-slate max-w-none text-slate-600 line-clamp-2 mb-4" dangerouslySetInnerHTML={{ __html: n.body }} />
                
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
                  {n.publish_at && (
                    <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {new Date(n.publish_at).toLocaleDateString()}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-100">
                    {n.audience}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-row sm:flex-col items-center sm:items-end justify-start sm:justify-center gap-2 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-5">
                <button
                  type="button"
                  onClick={() => setPreviewNotice(n)}
                  className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-primary hover:text-white transition-colors w-full sm:w-auto justify-center"
                >
                  <Eye className="h-4 w-4" /> {t("viewPdf")}
                </button>
                {n.attachment_url && (
                  <a 
                    href={n.attachment_url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary hover:text-white transition-colors w-full sm:w-auto justify-center"
                  >
                    <Download className="h-4 w-4" /> {t("download")}
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
    </div>
  );
}
