"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";
import type { StaticPageContent } from "@/lib/types";

const PAGES = [
  { key: "about", labelKey: "navAbout" },
  { key: "history", labelKey: "navHistory" },
  { key: "mission_vision", labelKey: "navMissionVision" },
  { key: "principal_message", labelKey: "navPrincipalMessage" },
  { key: "vice_principal_message", labelKey: "navVicePrincipalMessage" },
  { key: "chairman_message", labelKey: "navChairmanMessage" },
  { key: "facilities", labelKey: "navFacilities" },
  { key: "achievements", labelKey: "navAchievements" },
  { key: "admission_info", labelKey: "navAdmissionInfo" },
] as const;

export default function AboutSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTranslations("about");
  const [page, setPage] = useState<StaticPageContent | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setNotFound(false);
    fetchContent<StaticPageContent>(`/pages/${slug}`).then((d) => {
      if (!d) setNotFound(true);
      setPage(d);
    });
  }, [slug]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.key} href={`/about/${p.key}`} className={`block rounded-md px-3 py-2 hover:bg-gray-50 ${p.key === slug ? "bg-gray-100 font-medium" : ""}`}>
              {t(p.labelKey)}
            </Link>
          ))}
        </aside>
        <div className="md:col-span-3">
          {notFound && <p className="text-sm text-gray-500">{t("notConfigured")}</p>}
          {page && (
            <>
              <h1 className="mb-4 text-2xl font-semibold">{page.title_en ?? t(PAGES.find((p) => p.key === slug)?.labelKey ?? "navAbout")}</h1>
              <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: page.content_en ?? "" }} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
