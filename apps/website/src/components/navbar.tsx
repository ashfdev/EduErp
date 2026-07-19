"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import type { Institution } from "@/lib/types";
import { Menu, X, ChevronDown, UserCircle2, Search, Languages } from "lucide-react";
import { Button } from "@education-erp/ui";

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

export function Navbar({ institution }: { institution: Institution | null }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    <header 
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "bg-blue-50/95 backdrop-blur-md shadow-md border-b border-blue-200" : "bg-blue-100 border-b border-blue-200"
      }`}
    >
      {/* Top Bar removed as per user request */}

      {/* Main Navbar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-2 lg:py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          {institution?.logo_url ? (
            <div className="relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-slate-100 group-hover:ring-primary/20 transition-all">
              <Image src={institution.logo_url} alt="logo" fill sizes="56px" className="object-contain p-1" priority />
            </div>
          ) : (
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl">
              🏫
            </div>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-800 group-hover:text-primary transition-colors">
              {institution?.name_en ?? "Education ERP"}
            </h1>
            {institution?.tagline_en && (
              <p className="text-xs font-medium text-slate-500 line-clamp-1">{institution.tagline_en}</p>
            )}
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          <Link href="/" className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors rounded-md hover:bg-slate-50">
            {t("home")}
          </Link>
          {groups.map((g) => (
            <div key={g.key} className="group/dropdown relative">
              <button className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-primary transition-colors rounded-md hover:bg-slate-50">
                {t(g.key)}
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover/dropdown:rotate-180" />
              </button>
              
              {/* Dropdown Menu */}
              <div className="absolute left-0 top-full pt-2 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50">
                <div className="w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl shadow-black/5 ring-1 ring-black/5">
                  {g.children.map((c, i) => (
                    <div key={c.href}>
                      {c.subheading && c.subheading !== g.children[i - 1]?.subheading && (
                        <p className={`px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${i > 0 ? "mt-2 pt-2 border-t border-slate-100" : ""}`}>
                          {tAbout(c.subheading)}
                        </p>
                      )}
                      <Link
                        href={c.href}
                        className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
                      >
                        {label(c)}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>

        {/* Actions */}
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/result" className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors hidden xl:block">
            {t("resultLookup")}
          </Link>
          <button
            onClick={() => router.replace(pathname, { locale: otherLocale })}
            className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-primary transition-colors bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full"
            aria-label="Switch language"
          >
            <Languages className="h-4 w-4" />
            {otherLocale === "bn" ? "বাংলা" : "En"}
          </button>
          <Button variant="outline" size="icon" onClick={() => alert("Search functionality is coming soon!")} className="text-slate-600 hover:text-blue-600 rounded-full border-slate-300 bg-white shadow-sm hover:border-blue-300">
            <Search className="h-4 w-4" />
          </Button>
          <Button asChild className="rounded-full px-6 shadow-sm hover:shadow-md transition-all bg-blue-600 hover:bg-blue-700 text-white font-semibold border-0">
            <a href={portalUrl} target="_blank" rel="noreferrer">
              <UserCircle2 className="mr-2 h-4 w-4" />
              {t("portalLogin")}
            </a>
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="lg:hidden p-2 -mr-2 text-slate-600 hover:bg-slate-50 rounded-md" 
          onClick={() => setOpen(!open)} 
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
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
                  {t(g.key)}
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
                          onClick={() => setOpen(false)}
                        >
                          {label(c)}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
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
