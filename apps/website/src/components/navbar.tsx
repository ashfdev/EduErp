"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import type { Institution } from "@/lib/types";

const LINKS = [
  { href: "/", key: "home" },
  { href: "/about", key: "about" },
  { href: "/notices", key: "noticeBoard" },
  { href: "/gallery", key: "gallery" },
  { href: "/downloads", key: "downloads" },
  { href: "/admission", key: "admission" },
  { href: "/careers", key: "careers" },
  { href: "/contact", key: "contact" },
] as const;

export function Navbar({ institution }: { institution: Institution | null }) {
  const [open, setOpen] = useState(false);
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const otherLocale = locale === "bn" ? "en" : "bn";
  const t = useTranslations("nav");

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          {institution?.logo_url && (
            <Image src={institution.logo_url} alt="logo" width={40} height={40} className="h-10 w-10 rounded object-contain" priority />
          )}
          <div>
            <p className="font-semibold" style={{ color: "var(--primary)" }}>{institution?.name_en ?? "Institution"}</p>
            {institution?.tagline_en && <p className="text-xs text-gray-500">{institution.tagline_en}</p>}
          </div>
        </Link>

        <nav className="hidden gap-5 text-sm font-medium md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-gray-700 hover:text-[var(--primary)]">
              {t(l.key)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/result" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">{t("resultLookup")}</Link>
          <button
            onClick={() => router.replace(pathname, { locale: otherLocale })}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
            aria-label="Switch language"
          >
            {otherLocale === "bn" ? "বাংলা" : "English"}
          </button>
          <a href={portalUrl} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-sm text-white" style={{ background: "var(--primary)" }}>
            {t("portalLogin")}
          </a>
        </div>

        <button className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          ☰
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t bg-white p-4 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setOpen(false)}>
              {t(l.key)}
            </Link>
          ))}
          <Link href="/result" className="rounded-md px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setOpen(false)}>{t("resultLookup")}</Link>
          <button
            onClick={() => { router.replace(pathname, { locale: otherLocale }); setOpen(false); }}
            className="rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
          >
            {otherLocale === "bn" ? "বাংলা" : "English"}
          </button>
          <a href={portalUrl} target="_blank" rel="noreferrer" className="rounded-md px-3 py-2 text-sm hover:bg-gray-50">{t("portalLogin")}</a>
        </nav>
      )}
    </header>
  );
}
