"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { Notice } from "@/lib/types";

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
      className="max-h-80 divide-y overflow-y-auto rounded-lg border scroll-smooth"
    >
      {!notices.length && <p className="p-4 text-sm text-gray-500">{t("noNotices")}</p>}
      {notices.map((n) => (
        <div key={n.id} className="p-4">
          <button onClick={() => toggleExpand(n.id)} className="flex w-full items-center justify-between gap-4 text-left">
            <div className="min-w-0">
              <p className="truncate font-medium">{n.is_pinned ? "📌 " : ""}{n.title}</p>
              <p className="text-xs text-gray-500">{n.publish_at ? new Date(n.publish_at).toLocaleDateString() : ""}</p>
            </div>
            <span className="shrink-0 text-xs text-gray-400">{expandedId === n.id ? "▴" : "▾"}</span>
          </button>
          {expandedId === n.id && (
            <div className="mt-2 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: n.body }} />
          )}
          {expandedId === n.id && n.attachment_url && (
            <a href={n.attachment_url} className="mt-2 inline-block text-sm text-blue-600 hover:underline">
              {tCommon("download")}
            </a>
          )}
        </div>
      ))}
      <Link href="/notices" className="block p-3 text-center text-sm text-blue-600 hover:underline">
        {t("seeAllNotices")}
      </Link>
    </div>
  );
}
