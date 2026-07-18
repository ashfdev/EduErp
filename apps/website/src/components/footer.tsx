"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";

interface ImportantLink {
  id: string;
  title: string;
  url: string;
}

export function Footer({ institution }: { institution: Institution | null }) {
  const t = useTranslations("footer");
  const [links, setLinks] = useState<ImportantLink[]>([]);

  useEffect(() => {
    fetchContent<ImportantLink[]>("/important-links").then((data) => setLinks(data ?? []));
  }, []);

  return (
    <footer className="mt-12 border-t bg-gray-900 text-gray-300">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-lg font-semibold text-white">{institution?.name_en ?? "Institution"}</p>
          <p className="mt-2 text-sm">{institution?.established_text ?? institution?.tagline_en ?? ""}</p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">{t("quickLinks")}</p>
          <ul className="space-y-1 text-sm">
            <li><Link href="/about">{t("aboutUs")}</Link></li>
            <li><Link href="/notices">{t("noticeBoard")}</Link></li>
            <li><Link href="/admission">{t("admission")}</Link></li>
            <li><Link href="/careers">{t("careers")}</Link></li>
            <li><Link href="/result">{t("resultLookup")}</Link></li>
            <li><Link href="/contact">{t("contact")}</Link></li>
          </ul>
        </div>
        {!!links.length && (
          <div>
            <p className="mb-2 font-semibold text-white">{t("importantLinks")}</p>
            <ul className="space-y-1 text-sm">
              {links.map((l) => (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="hover:text-white">{l.title}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="mb-2 font-semibold text-white">{t("contactHeading")}</p>
          <p className="text-sm">{institution?.address}</p>
          <p className="text-sm">{institution?.phone_primary}</p>
          <p className="text-sm">{institution?.email_primary}</p>
          <div className="mt-2 flex gap-3 text-sm">
            {institution?.facebook_url && <a href={institution.facebook_url} target="_blank" rel="noreferrer">Facebook</a>}
            {institution?.youtube_url && <a href={institution.youtube_url} target="_blank" rel="noreferrer">YouTube</a>}
          </div>
        </div>
      </div>
      <div className="border-t border-gray-800 py-4 text-center text-xs">
        © {new Date().getFullYear()} {institution?.name_en ?? "Institution"} | {t("poweredBy")}
      </div>
    </footer>
  );
}
