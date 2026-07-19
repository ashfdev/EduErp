"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";

interface NoticeResult {
  id: string;
  title: string;
  publish_at: string | null;
}
interface PageResult {
  page_key: string;
  title_en: string | null;
  title_bn: string | null;
}
interface SearchResults {
  notices: NoticeResult[];
  pages: PageResult[];
}

// Static pages live under two different route prefixes depending on which
// nav cluster they belong to — mirrors the ACADEMIC_KEYS/ABOUT_KEYS split
// already used by the navbar and the /about, /academic sidebars.
const ACADEMIC_PAGE_KEYS = new Set(["course_curriculum", "grading_system", "academic_regulations", "policies"]);

export default function SearchPage() {
  const t = useTranslations("search");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [results, setResults] = useState<SearchResults | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ notices: [], pages: [] });
      return;
    }
    fetchContent<SearchResults>("/search", { q }).then((d) => setResults(d ?? { notices: [], pages: [] }));
  }, [q]);

  const hasResults = !!(results && (results.notices.length || results.pages.length));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-500">{t("resultsFor", { q })}</p>

      {results === null && <p className="text-sm text-gray-500">{t("searching")}</p>}
      {results !== null && !hasResults && <p className="text-sm text-gray-500">{t("noResults")}</p>}

      {!!results?.notices.length && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("noticesHeading")}</h2>
          <div className="divide-y rounded-lg border">
            {results.notices.map((n) => (
              <Link key={n.id} href="/notices" className="block p-4 hover:bg-gray-50">
                <p className="font-medium">{n.title}</p>
                {n.publish_at && <p className="mt-1 text-xs text-gray-400">{new Date(n.publish_at).toLocaleDateString()}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {!!results?.pages.length && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("pagesHeading")}</h2>
          <div className="divide-y rounded-lg border">
            {results.pages.map((p) => (
              <Link
                key={p.page_key}
                href={`${ACADEMIC_PAGE_KEYS.has(p.page_key) ? "/academic" : "/about"}/${p.page_key}`}
                className="block p-4 hover:bg-gray-50"
              >
                <p className="font-medium">{(locale === "bn" ? p.title_bn : p.title_en) ?? p.title_en ?? p.page_key}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
