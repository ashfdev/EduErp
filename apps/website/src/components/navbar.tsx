"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import type { Institution } from "@/lib/types";

interface NavLink {
  href: string;
  key: string;
  labelFrom?: "nav" | "about" | "academic" | "governingBody" | "faculty";
}
interface NavGroup {
  key: string;
  children: NavLink[];
}

// About's sub-page keys are the same ones about/page.tsx and
// about/[slug]/page.tsx already use (t("about")) — reused here rather than
// duplicated, so the nav dropdown and the About index page can never drift.
const ABOUT_CHILDREN: NavLink[] = [
  { href: "/about", key: "navAbout", labelFrom: "about" },
  { href: "/about/history", key: "navHistory", labelFrom: "about" },
  { href: "/about/mission_vision", key: "navMissionVision", labelFrom: "about" },
  { href: "/about/principal_message", key: "navPrincipalMessage", labelFrom: "about" },
  { href: "/about/vice_principal_message", key: "navVicePrincipalMessage", labelFrom: "about" },
  { href: "/about/chairman_message", key: "navChairmanMessage", labelFrom: "about" },
  { href: "/about/facilities", key: "navFacilities", labelFrom: "about" },
  { href: "/about/achievements", key: "navAchievements", labelFrom: "about" },
  { href: "/governing-body", key: "title", labelFrom: "governingBody" },
];

// Faculty, Departments/Programs (university-only — Undergraduate/Graduate/
// PhD programs are shown as sections within that one page rather than as
// three separate nav links), Academic Calendar (reuses the already-built
// /events page instead of a duplicate static page), Course Curriculum,
// Grading System, Academic Regulations, Policies (all served via the
// StaticPage CMS, mirroring About's own pattern), and the public Class
// Schedule/Routine viewer.
const ACADEMIC_CHILDREN: NavLink[] = [
  { href: "/faculty", key: "title", labelFrom: "faculty" },
  { href: "/events", key: "academicCalendar" },
  { href: "/routine", key: "routine" },
  { href: "/academic/course_curriculum", key: "navCourseCurriculum", labelFrom: "academic" },
  { href: "/academic/grading_system", key: "navGradingSystem", labelFrom: "academic" },
  { href: "/academic/academic_regulations", key: "navAcademicRegulations", labelFrom: "academic" },
  { href: "/academic/policies", key: "navPolicies", labelFrom: "academic" },
  { href: "/downloads", key: "downloads" },
];

const NOTICES_CHILDREN: NavLink[] = [
  { href: "/notices", key: "noticeBoard" },
  { href: "/events", key: "events" },
];

const ADMISSION_CHILDREN: NavLink[] = [
  { href: "/admission", key: "applyNow" },
  { href: "/admission/status", key: "checkStatus" },
  { href: "/about/admission_info", key: "navAdmissionInfo", labelFrom: "about" },
];

const MEDIA_CHILDREN: NavLink[] = [
  { href: "/gallery", key: "gallery" },
  { href: "/careers", key: "careers" },
  { href: "/contact", key: "contact" },
];

export function Navbar({ institution }: { institution: Institution | null }) {
  const [open, setOpen] = useState(false);
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null);
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const otherLocale = locale === "bn" ? "en" : "bn";
  const t = useTranslations("nav");
  const tAbout = useTranslations("about");
  const tAcademic = useTranslations("academic");
  const tGoverningBody = useTranslations("governingBody");
  const tFaculty = useTranslations("faculty");

  function label(link: NavLink): string {
    if (link.labelFrom === "about") return tAbout(link.key);
    if (link.labelFrom === "academic") return tAcademic(link.key);
    if (link.labelFrom === "governingBody") return tGoverningBody(link.key);
    if (link.labelFrom === "faculty") return tFaculty(link.key);
    return t(link.key);
  }

  const isUniversity = institution?.type === "UNIVERSITY";
  const academicChildren = isUniversity ? [...ACADEMIC_CHILDREN, { href: "/departments", key: "departments" }] : ACADEMIC_CHILDREN;

  const groups: NavGroup[] = [
    { key: "about", children: ABOUT_CHILDREN },
    { key: "academic", children: academicChildren },
    { key: "notices", children: NOTICES_CHILDREN },
    { key: "admission", children: ADMISSION_CHILDREN },
    { key: "media", children: MEDIA_CHILDREN },
  ];

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

        <nav className="hidden gap-1 text-sm font-medium md:flex">
          <Link href="/" className="rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-[var(--primary)]">
            {t("home")}
          </Link>
          {groups.map((g) => (
            <div key={g.key} className="group relative">
              <button className="flex items-center gap-1 rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-[var(--primary)]">
                {t(g.key)}
                <span className="text-xs">▾</span>
              </button>
              <div className="invisible absolute left-0 top-full z-40 min-w-[220px] rounded-md border bg-white py-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
                {g.children.map((c) => (
                  <Link key={c.href} href={c.href} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[var(--primary)]">
                    {label(c)}
                  </Link>
                ))}
              </div>
            </div>
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
          <Link href="/" className="rounded-md px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setOpen(false)}>{t("home")}</Link>
          {groups.map((g) => (
            <div key={g.key}>
              <button
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
                onClick={() => setMobileGroupOpen((k) => (k === g.key ? null : g.key))}
              >
                {t(g.key)}
                <span className="text-xs">{mobileGroupOpen === g.key ? "▴" : "▾"}</span>
              </button>
              {mobileGroupOpen === g.key && (
                <div className="ml-3 flex flex-col gap-1 border-l pl-3">
                  {g.children.map((c) => (
                    <Link key={c.href} href={c.href} className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => setOpen(false)}>
                      {label(c)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
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
