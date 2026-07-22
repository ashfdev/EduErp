"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { Notice } from "@/lib/types";
import { Pin, ChevronDown, Download, ArrowRight } from "lucide-react";

const AUTO_SCROLL_INTERVAL_MS = 3000;
const ROW_HEIGHT_PX = 76;

export function NoticeBoardWidget({ notices }: { notices: Notice[] }) {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollingUp = useRef(false);

  const canAutoScroll = notices.length > 3;

  useEffect(() => {
    if (!canAutoScroll || paused) return;
    const el = containerRef.current;
    if (!el) return;

    const interval = setInterval(() => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const atTop = el.scrollTop <= 4;
      if (scrollingUp.current && atTop) scrollingUp.current = false;
      else if (!scrollingUp.current && atBottom) scrollingUp.current = true;

      el.scrollBy({ top: scrollingUp.current ? -ROW_HEIGHT_PX : ROW_HEIGHT_PX, behavior: "smooth" });
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [canAutoScroll, paused]);

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      className="max-h-96 divide-y divide-slate-100 overflow-y-auto scroll-smooth"
    >
      {!notices.length && <p className="p-6 text-sm text-slate-500">{t("noNotices")}</p>}
      {notices.map((n) => (
        <div key={n.id} className={`transition-colors hover:bg-slate-50/70 border-l-4 ${n.is_pinned ? "border-primary bg-primary/5" : "border-transparent"}`}>
          <button onClick={() => toggleExpand(n.id)} className="flex w-full items-center justify-between gap-4 p-4 text-left">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.is_pinned ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-400"}`}>
                <Pin className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {n.is_pinned && <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">Pinned</span>}
                  <p className="truncate text-sm font-semibold text-slate-800">{n.title}</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{n.publish_at ? new Date(n.publish_at).toLocaleDateString() : ""}</p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expandedId === n.id ? "rotate-180" : ""}`} />
          </button>
          {expandedId === n.id && (
            <div className="px-4 pb-4 pl-14">
              <div className="text-sm leading-relaxed text-slate-600" dangerouslySetInnerHTML={{ __html: n.body }} />
              {n.attachment_url && (
                <a href={n.attachment_url} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80">
                  <Download className="h-3.5 w-3.5" />
                  {tCommon("download")}
                </a>
              )}
            </div>
          )}
        </div>
      ))}
      <Link href="/notices" className="flex items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/50 p-3.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors">
        {t("seeAllNotices")}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
