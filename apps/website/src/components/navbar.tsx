"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import type { Institution, Notice } from "@/lib/types";
import { Menu, X, ChevronDown, UserCircle2, Megaphone } from "lucide-react";
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@education-erp/ui";
import { fetchContent } from "@/lib/content-api";
import { NOTICES_LAST_VISIT_KEY, markNoticesVisited } from "@/lib/notices-visit";

interface NavLink {
  href: string;
  key: string;
  labelFrom?: "nav" | "about" | "academic" | "governingBody" | "faculty";
  // Renders a non-clickable sub-header row before this link whenever it
  // differs from the previous child's — purely additive to the generic
  // dropdown renderer below, so groups that never set it (Academic,
  // Notices, Admission, Media) are completely unaffected. Resolved via the
  // "about" namespace since only the About cluster uses this today.
  subheading?: string;
}
interface NavGroup {
  key: string;
  children: NavLink[];
}

const ABOUT_CHILDREN: NavLink[] = [
  { href: "/about", key: "navAbout", labelFrom: "about", subheading: "groupInstitution" },
  { href: "/about/history", key: "navHistory", labelFrom: "about", subheading: "groupInstitution" },
  { href: "/about/mission_vision", key: "navMissionVision", labelFrom: "about", subheading: "groupInstitution" },
  { href: "/about/facilities", key: "navFacilities", labelFrom: "about", subheading: "groupInstitution" },
  { href: "/about/achievements", key: "navAchievements", labelFrom: "about", subheading: "groupInstitution" },
  { href: "/governing-body", key: "title", labelFrom: "governingBody", subheading: "groupInstitution" },
  { href: "/about/principal_message", key: "navPrincipalMessage", labelFrom: "about", subheading: "groupLeadership" },
  { href: "/about/vice_principal_message", key: "navVicePrincipalMessage", labelFrom: "about", subheading: "groupLeadership" },
  { href: "/about/chairman_message", key: "navChairmanMessage", labelFrom: "about", subheading: "groupLeadership" },
];

const ACADEMIC_CHILDREN: NavLink[] = [
  { href: "/faculty", key: "title", labelFrom: "faculty" },
  { href: "/staff", key: "staffTitle", labelFrom: "faculty" },
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

export function Navbar({ institution, notices = [] }: { institution: Institution | null, notices?: Notice[] }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null);
  const [hasNewNotice, setHasNewNotice] = useState(false);
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

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Login-free "new since your last visit" badge — no visitor accounts on
  // the public site, so this compares the latest Notice's timestamp against
  // one stored in the visitor's own browser, not a real per-user unread
  // state like the admin/portal/teacher notification bell.
  useEffect(() => {
    fetchContent<{ created_at: string }[]>("/notices", { limit: "1" })
      .then((notices) => {
        const latest = notices?.[0]?.created_at;
        if (!latest) return;
        const lastVisit = localStorage.getItem(NOTICES_LAST_VISIT_KEY);
        if (!lastVisit || new Date(latest) > new Date(lastVisit)) setHasNewNotice(true);
      })
      .catch(() => { });
  }, []);

  function clearNoticeBadge() {
    markNoticesVisited();
    setHasNewNotice(false);
  }

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
  ];

  return (
    <header className="sticky top-0 z-50 w-full flex flex-col">
      {/* Top Bar (Secondary Actions) */}
      <div className="bg-[#2C3E50] text-slate-200 py-2 relative z-20">
        <div className="mx-auto flex w-full max-w-[96%] items-center justify-between px-4 sm:px-6 lg:px-8 text-[11px] sm:text-xs font-medium">
          
          {/* Top Left: Notices Ticker */}
          <div className="w-[55%] flex items-center overflow-hidden">
            {notices.length > 0 && (
              <div className="flex animate-ticker gap-12 whitespace-nowrap hover:[animation-play-state:paused] text-slate-200">
                {[...notices, ...notices].map((n, i) => (
                  <Link key={`${n.id}-${i}`} href="/notices" className="flex items-center gap-2 hover:text-white transition-colors">
                    {n.is_pinned ? (
                      <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase font-bold text-white tracking-wider">Pinned</span>
                    ) : (
                      <Megaphone className="h-3.5 w-3.5 text-white/70" />
                    )}
                    <span className="font-semibold tracking-wide">{n.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top Right: Actions & Language */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link href="/result" className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-transparent text-slate-200 hover:text-white hover:bg-white/10 transition-colors font-semibold">
              {t("resultLookup")}
            </Link>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent text-slate-200 hover:text-white hover:bg-white/10 transition-colors font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-label="Switch language"
                >
                  {locale === "en" ? "English" : "বাংলা"}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-24">
                <DropdownMenuItem 
                  className={`font-bold ${locale === "en" ? "bg-slate-100" : ""}`}
                  onClick={() => router.replace(pathname, { locale: "en" })}
                >
                  English
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`font-bold ${locale === "bn" ? "bg-slate-100" : ""}`}
                  onClick={() => router.replace(pathname, { locale: "bn" })}
                >
                  বাংলা
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className={`w-full transition-all duration-300 relative z-10 bg-[#F5F7FA] border-b border-slate-200 ${scrolled ? "shadow-sm py-2" : "py-3 lg:py-4"}`}>
        <div className="mx-auto flex w-full max-w-[96%] items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
          
          {/* Logo (Left) */}
          <div className="flex justify-start items-center min-w-0 shrink-0 max-w-[30%]">
            <Link href="/" className="flex items-center gap-3 group">
              {institution?.logo_url ? (
                <div className={`relative shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-slate-100 group-hover:ring-primary/20 transition-all ${scrolled ? "h-10 w-10 sm:h-12 sm:w-12" : "h-12 w-12 sm:h-14 sm:w-14"}`}>
                  <Image src={institution.logo_url} alt="logo" fill sizes="56px" className="object-contain p-1" priority />
                </div>
              ) : (
                <div className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl transition-all ${scrolled ? "h-10 w-10 sm:h-12 sm:w-12" : "h-12 w-12 sm:h-14 sm:w-14"}`}>
                  🏫
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <h1 className="text-base sm:text-lg lg:text-xl font-bold leading-tight tracking-tight text-slate-800 group-hover:text-primary transition-colors line-clamp-2">
                  {institution?.name_en ?? "Education ERP"}
                </h1>
                {institution?.tagline_en && !scrolled && (
                  <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">{institution.tagline_en}</p>
                )}
              </div>
            </Link>
          </div>

          {/* Desktop Navigation (Center) */}
          <nav className="hidden lg:flex shrink-0 items-center justify-center gap-1 xl:gap-2">
            <Link
              href="/"
              className={`px-3 py-2 text-[13px] xl:text-[15px] font-bold transition-all hover:text-primary ${pathname === "/" ? "text-primary" : "text-slate-800"
                }`}
            >
              {t("home")}
            </Link>
            {groups.map((g) => {
              const groupActive = g.children.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
              return (
                <div key={g.key} className="group/dropdown relative">
                  <button
                    className={`relative flex items-center gap-1 px-3 py-2 text-[13px] xl:text-[15px] font-bold transition-all hover:text-primary ${groupActive ? "text-primary" : "text-slate-800"
                      }`}
                  >
                    {t(g.key)}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover/dropdown:rotate-180 opacity-60" />
                  </button>

                  {/* Dropdown Menu */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50">
                    <div className="w-56 rounded-2xl border border-slate-100 bg-white/95 backdrop-blur-xl p-2 shadow-xl shadow-black/5 ring-1 ring-black/5">
                      {g.children.map((c, i) => {
                        const childActive = pathname === c.href || pathname.startsWith(`${c.href}/`);
                        return (
                          <div key={c.href}>
                            {c.subheading && c.subheading !== g.children[i - 1]?.subheading && (
                              <p className={`px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 ${i > 0 ? "mt-2 pt-2 border-t border-slate-100/80" : ""}`}>
                                {tAbout(c.subheading)}
                              </p>
                            )}
                            <Link
                              href={c.href}
                              onClick={g.key === "notices" ? clearNoticeBadge : undefined}
                              className={`block px-3 py-2.5 text-[13px] font-semibold transition-all ${childActive ? "text-primary" : "text-slate-600 hover:text-primary"
                                }`}
                            >
                              {label(c)}
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Additional Direct Links */}
            <Link href="/gallery" className={`px-3 py-2 text-[13px] xl:text-[15px] font-bold transition-all hover:text-primary ${pathname === "/gallery" ? "text-primary" : "text-slate-800"}`}>
              {t("gallery")}
            </Link>
            <Link href="/careers" className={`px-3 py-2 text-[13px] xl:text-[15px] font-bold transition-all hover:text-primary ${pathname === "/careers" ? "text-primary" : "text-slate-800"}`}>
              {t("careers")}
            </Link>
            <Link href="/contact" className={`px-3 py-2 text-[13px] xl:text-[15px] font-bold transition-all hover:text-primary ${pathname === "/contact" ? "text-primary" : "text-slate-800"}`}>
              {t("contact")}
            </Link>
          </nav>

          {/* Right Section (Portal Login) */}
          <div className="flex justify-end items-center gap-4 shrink-0">
            <a 
              href={portalUrl} 
              target="_blank" 
              rel="noreferrer"
              className="hidden lg:flex items-center gap-1.5 px-6 py-2.5 bg-[#0B5ED7] text-white hover:bg-[#0A58CA] transition-colors rounded-md font-bold text-sm shadow-sm"
            >
              {t("portalLogin")}
            </a>

            {/* Mobile Toggle */}
            <button
              className="lg:hidden p-2 -mr-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors relative z-0"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {open && (
        <div className="lg:hidden border-t bg-white h-[calc(100vh-80px)] overflow-y-auto">
          <nav className="flex flex-col p-4 pb-20 space-y-1">
            <Link href="/" className="rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
              {t("home")}
            </Link>

            {groups.map((g) => (
              <div key={g.key} className="border-b border-slate-50 last:border-0">
                <button
                  className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setMobileGroupOpen((k) => (k === g.key ? null : g.key))}
                >
                  <span className="flex items-center gap-1.5">
                    {t(g.key)}
                    {g.key === "notices" && hasNewNotice && <span className="h-2 w-2 rounded-full bg-destructive" />}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${mobileGroupOpen === g.key ? "rotate-180 text-primary" : "text-slate-400"}`} />
                </button>

                {mobileGroupOpen === g.key && (
                  <div className="mb-2 ml-4 flex flex-col space-y-1 border-l-2 border-slate-100 pl-4 py-1">
                    {g.children.map((c, i) => (
                      <div key={c.href}>
                        {c.subheading && c.subheading !== g.children[i - 1]?.subheading && (
                          <p className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${i > 0 ? "mt-2 pt-2 border-t border-slate-100" : ""}`}>
                            {tAbout(c.subheading)}
                          </p>
                        )}
                        <Link
                          href={c.href}
                          className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-primary"
                          onClick={() => {
                            setOpen(false);
                            if (g.key === "notices") clearNoticeBadge();
                          }}
                        >
                          {label(c)}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <Link href="/gallery" className="rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
              {t("gallery")}
            </Link>
            <Link href="/careers" className="rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
              {t("careers")}
            </Link>
            <Link href="/contact" className="rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
              {t("contact")}
            </Link>

            <div className="mt-6 pt-6 border-t flex flex-col gap-3">
              <Button asChild className="w-full rounded-xl justify-center h-12 text-base">
                <a href={portalUrl} target="_blank" rel="noreferrer">
                  <UserCircle2 className="mr-2 h-5 w-5" />
                  {t("portalLogin")}
                </a>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
