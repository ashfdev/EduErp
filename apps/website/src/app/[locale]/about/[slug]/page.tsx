"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { StaticPageContent, Institution } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import {
  Info, History, Target, Building2, Trophy, BookOpen,
  MessageCircle, ChevronRight, FileQuestion, Download,
  CheckCircle2, Calendar, Users, GraduationCap, Award,
  Lightbulb, ShieldCheck, HeartHandshake, Globe, MapPin, Layers,
  Compass, Landmark, Sparkles
} from "lucide-react";

const PAGES = [
  { key: "about", labelKey: "navAbout", icon: Info, color: "text-indigo-600 bg-indigo-50" },
  { key: "history", labelKey: "navHistory", icon: History, color: "text-blue-600 bg-blue-50" },
  { key: "mission_vision", labelKey: "navMissionVision", icon: Target, color: "text-purple-600 bg-purple-50" },
  { key: "facilities", labelKey: "navFacilities", icon: Building2, color: "text-cyan-600 bg-cyan-50" },
  { key: "achievements", labelKey: "navAchievements", icon: Trophy, color: "text-amber-600 bg-amber-50" },
  { key: "admission_info", labelKey: "navAdmissionInfo", icon: BookOpen, color: "text-rose-600 bg-rose-50" },
  { key: "principal_message", labelKey: "navPrincipalMessage", icon: MessageCircle, color: "text-emerald-600 bg-emerald-50" },
  { key: "vice_principal_message", labelKey: "navVicePrincipalMessage", icon: MessageCircle, color: "text-blue-600 bg-blue-50" },
  { key: "chairman_message", labelKey: "navChairmanMessage", icon: MessageCircle, color: "text-purple-600 bg-purple-50" },
  { key: "governing_body", labelKey: "navGoverningBody", icon: Users, color: "text-indigo-600 bg-indigo-50" },
] as const;

// Guaranteed working picsum image URLs matching next.config.mjs allowed domains
function getSubpageCover(slug: string): string {
  switch (slug) {
    case "principal_message":
      return "https://picsum.photos/seed/principal-leader/400/500";
    case "vice_principal_message":
      return "https://picsum.photos/seed/vp-leader/400/500";
    case "chairman_message":
      return "https://picsum.photos/seed/chairman-leader/400/500";
    case "facilities":
      return "https://picsum.photos/seed/school-facility/800/600";
    case "history":
      return "https://picsum.photos/seed/school-history/800/600";
    case "achievements":
      return "https://picsum.photos/seed/school-trophy/800/600";
    case "mission_vision":
      return "https://picsum.photos/seed/school-vision/800/600";
    default:
      return "https://picsum.photos/seed/school-campus/800/600";
  }
}

function getSubpageSubtitle(slug: string, instName: string): string {
  if (slug.includes("message")) {
    return `Official message and guidance from the leadership of ${instName}.`;
  }
  if (slug === "history") {
    return `Tracing the founding, growth, and academic heritage of ${instName}.`;
  }
  if (slug === "mission_vision") {
    return `Our core educational purpose, strategic vision, and values.`;
  }
  if (slug === "facilities") {
    return `Explore our modern campus infrastructure, laboratories, and learning spaces.`;
  }
  if (slug === "achievements") {
    return `Celebrating student honors, board exam results, and institutional excellence.`;
  }
  return `Information and details from ${instName}.`;
}

export default function AboutSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const locale = useLocale();
  const t = useTranslations("about");
  const tCommon = useTranslations("common");

  const { data: page, error, notFound, refetch } = useContent<StaticPageContent>(`/pages/${slug}`);
  const { data: institution } = useContent<Institution>("/institution");

  const currentPage = PAGES.find((p) => p.key === slug);
  const Icon = currentPage?.icon ?? FileQuestion;

  const pageTitle = (locale === "bn" ? page?.title_bn : page?.title_en) ?? page?.title_en ?? null;
  const pageContent = (locale === "bn" ? page?.content_bn : page?.content_en) ?? page?.content_en ?? "";

  const instName = (locale === "bn" ? institution?.name_bn : institution?.name_en) || institution?.name_en || "Alhumaira Model School & College";
  const foundedYear = institution?.founded_year || 2010;
  const currentYear = new Date().getFullYear();
  const yearsExcellence = Math.max(1, currentYear - foundedYear);

  const isLeadershipPage = slug.includes("message");

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/70 pb-20 pt-6">
      {/* Centered container with narrow side margins */}
      <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 space-y-8">

        {error && (
          <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
        )}

        {notFound && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-16 text-center">
            <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon className="h-8 w-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Page Not Configured</h2>
            <p className="text-slate-500 text-sm max-w-xs mx-auto">{t("notConfigured")}</p>
          </div>
        )}

        {/* ==================== 1. MAIN ABOUT US PAGE (slug === "about") ==================== */}
        {slug === "about" && (
          <div className="space-y-8">
            
            {/* Hero Banner */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                <div className="md:col-span-7 space-y-4">
                  <nav aria-label="Breadcrumb" className="flex text-xs font-semibold text-slate-400">
                    <ol className="inline-flex items-center space-x-1.5">
                      <li>
                        <Link href="/" className="hover:text-indigo-600 transition-colors">Home</Link>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-800 font-bold">About Us</span>
                      </li>
                    </ol>
                  </nav>

                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight">
                    {pageTitle || "Nurturing Minds, Shaping Futures"}
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl font-normal">
                    {institution?.established_text ||
                      `Welcome to ${instName}, where tradition meets innovation in a modern academic setting designed for excellence.`}
                  </p>

                  <div className="pt-2">
                    <a
                      href="/downloads"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-all shadow-xs"
                    >
                      <span>Download Brochure</span>
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <div className="md:col-span-5">
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative">
                    <img
                      src={getSubpageCover("about")}
                      alt={`${instName} Campus`}
                      className="object-cover w-full h-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Our Story & Bento Stats */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                
                {/* Story Narrative */}
                <div className="lg:col-span-7 space-y-4">
                  <span className="inline-block bg-indigo-50 text-indigo-700 px-3.5 py-1 rounded-md font-bold text-xs uppercase tracking-wider">
                    OUR STORY
                  </span>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    A Legacy of Excellence Since {foundedYear}
                  </h2>

                  <div className="text-slate-600 text-sm leading-relaxed space-y-3 font-normal">
                    <p>
                      Established in {foundedYear}, {instName} was founded with a singular vision: to provide a holistic, premium educational experience that prepares students for the challenges of tomorrow while deeply rooting them in foundational values.
                    </p>
                    <p>
                      Our modern approach to pedagogy, combined with state-of-the-art facilities, ensures that every learner receives personalized attention and unparalleled opportunities for growth.
                    </p>
                    <ul className="space-y-2.5 pt-2">
                      <li className="flex items-start gap-2.5 text-slate-700 font-medium">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>Comprehensive curriculum blending tradition and technology.</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-slate-700 font-medium">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>Dedicated focus on student well-being and holistic development.</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-slate-700 font-medium">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>Modern facilities designed for collaborative learning.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Bento Stats 2x2 */}
                <div className="lg:col-span-5 grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200/80">
                    <Calendar className="h-6 w-6 text-indigo-600 mb-3" />
                    <h3 className="text-3xl font-bold text-slate-900 leading-none mb-1">{foundedYear}</h3>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Year Founded</p>
                  </div>

                  <div className="bg-indigo-50 p-5 sm:p-6 rounded-2xl border border-indigo-100">
                    <Users className="h-6 w-6 text-indigo-700 mb-3" />
                    <h3 className="text-3xl font-bold text-indigo-950 leading-none mb-1">800+</h3>
                    <p className="text-xs font-semibold text-indigo-700 uppercase">Active Students</p>
                  </div>

                  <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200/80">
                    <GraduationCap className="h-6 w-6 text-indigo-600 mb-3" />
                    <h3 className="text-3xl font-bold text-slate-900 leading-none mb-1">35+</h3>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Faculty Members</p>
                  </div>

                  <div className="bg-amber-50 p-5 sm:p-6 rounded-2xl border border-amber-200/60">
                    <Award className="h-6 w-6 text-amber-600 mb-3" />
                    <h3 className="text-3xl font-bold text-amber-950 leading-none mb-1">{yearsExcellence}+</h3>
                    <p className="text-xs font-semibold text-amber-800 uppercase">Years Excellence</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Institutional Overview Quick-Facts Grid */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs space-y-6">
              <div className="space-y-1">
                <span className="inline-block bg-indigo-50 text-indigo-700 px-3.5 py-1 rounded-md font-bold text-xs uppercase tracking-wider">
                  INSTITUTIONAL HIGHLIGHTS
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Key Information & Specs</h2>
              </div>

              {/* 6 Structured Mini Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">Chattogram, Bangladesh</p>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-purple-100/70 text-purple-700 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Education Board</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">BISE Chattogram</p>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-rose-100/70 text-rose-700 flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Classes Offered</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">Class 6 to Class 10</p>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-cyan-100/70 text-cyan-700 flex items-center justify-center shrink-0">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Medium of Instruction</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">Bengali (Bangla Medium)</p>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Enrolled Students</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">800+ Students</p>
                  </div>
                </div>

                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/70 flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Faculty Staff</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">35+ Qualified Teachers</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Core Values Grid */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Core Values</h2>
                <p className="text-slate-500 text-xs sm:text-sm">The principles that guide our academic community and shape our educational approach.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-50/80 p-6 rounded-2xl border border-slate-200/70">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-2xs">
                    <Lightbulb className="h-6 w-6 text-amber-500" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mb-2">Innovation</h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    Fostering creative thinking and modern problem-solving methodologies in every classroom.
                  </p>
                </div>

                <div className="bg-slate-50/80 p-6 rounded-2xl border border-slate-200/70">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-2xs">
                    <ShieldCheck className="h-6 w-6 text-indigo-600" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mb-2">Integrity</h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    Building strong moral character and ethical foundations that last a lifetime.
                  </p>
                </div>

                <div className="bg-slate-50/80 p-6 rounded-2xl border border-slate-200/70">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-2xs">
                    <HeartHandshake className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mb-2">Inclusivity</h3>
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                    Creating a welcoming environment where every student's unique potential is celebrated.
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ==================== 2. ALL OTHER SUB-PAGES (Tailored Light Designs) ==================== */}
        {slug !== "about" && page && (
          <div className="space-y-8">
            
            {/* Subpage Hero Banner */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                
                {/* Left Intro Text */}
                <div className="md:col-span-7 space-y-4">
                  <nav aria-label="Breadcrumb" className="flex text-xs font-semibold text-slate-400">
                    <ol className="inline-flex items-center space-x-1.5">
                      <li>
                        <Link href="/" className="hover:text-indigo-600 transition-colors">Home</Link>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                        <Link href="/about/about" className="hover:text-indigo-600 transition-colors">About</Link>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-800 font-bold">{pageTitle ?? t(currentPage?.labelKey ?? "navAbout")}</span>
                      </li>
                    </ol>
                  </nav>

                  <div className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${currentPage?.color ?? "bg-indigo-50 text-indigo-700"}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md">
                      {isLeadershipPage ? "LEADERSHIP DESK" : "INSTITUTIONAL HIGHLIGHT"}
                    </span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
                    {pageTitle ?? t(currentPage?.labelKey ?? "navAbout")}
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                    {getSubpageSubtitle(slug, instName)}
                  </p>
                </div>

                {/* Right Hero Image Card */}
                <div className="md:col-span-5">
                  <div className={`rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative bg-slate-100 ${isLeadershipPage ? "aspect-[3/4] max-w-xs mx-auto" : "aspect-[4/3]"}`}>
                    <img
                      src={getSubpageCover(slug)}
                      alt={pageTitle || "Page Banner"}
                      className="object-cover w-full h-full"
                    />
                    {isLeadershipPage && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-4 text-white">
                        <p className="font-bold text-sm leading-tight">{pageTitle}</p>
                        <p className="text-xs text-slate-300 font-medium">{instName}</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Custom Tailored Highlights for Specific Pages */}
            {slug === "facilities" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <Building2 className="h-6 w-6 text-indigo-600 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900">Modern Classrooms</h3>
                  <p className="text-xs text-slate-500 mt-1">Equipped with multimedia systems and ergonomic furniture.</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <Globe className="h-6 w-6 text-cyan-600 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900">Computer & ICT Lab</h3>
                  <p className="text-xs text-slate-500 mt-1">High-speed internet access and dedicated workstation setups.</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <BookOpen className="h-6 w-6 text-emerald-600 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900">Central Library</h3>
                  <p className="text-xs text-slate-500 mt-1">Extensive collection of textbooks, journals, and reference materials.</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <Trophy className="h-6 w-6 text-amber-600 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900">Sports & Recreation</h3>
                  <p className="text-xs text-slate-500 mt-1">Spacious playground and athletic training facilities.</p>
                </div>
              </div>
            )}

            {slug === "achievements" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs text-center">
                  <Award className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <h3 className="text-3xl font-extrabold text-slate-900">100%</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase mt-1">Board Exam Pass Rate</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs text-center">
                  <Trophy className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                  <h3 className="text-3xl font-extrabold text-slate-900">Top 10</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase mt-1">Board Academic Rank</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs text-center">
                  <Sparkles className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                  <h3 className="text-3xl font-extrabold text-slate-900">25+</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase mt-1">National Science & Debate Awards</p>
                </div>
              </div>
            )}

            {/* Dynamic CMS Page Content (Clean, High-Readability Article - NO Artificial 'Overview & Details' Header) */}
            {pageContent && (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs">
                <div
                  className="
                    prose prose-slate max-w-none text-sm sm:text-base leading-relaxed
                    prose-headings:font-extrabold prose-headings:text-slate-900 prose-headings:tracking-tight
                    prose-h2:text-xl sm:prose-h2:text-2xl prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-indigo-950 prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-2
                    prose-h3:text-lg sm:prose-h3:text-xl prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-indigo-700
                    prose-p:text-slate-600 prose-p:leading-[1.8] prose-p:my-3
                    prose-ul:my-4 prose-ul:space-y-2 prose-li:text-slate-600 prose-li:my-1 prose-li:marker:text-indigo-600
                    prose-strong:text-slate-900 prose-strong:font-bold
                    prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-50/50 prose-blockquote:rounded-r-2xl prose-blockquote:p-5 prose-blockquote:text-slate-700 prose-blockquote:italic prose-blockquote:my-6
                    prose-img:rounded-2xl prose-img:border prose-img:border-slate-200 prose-img:shadow-xs prose-img:my-6
                  "
                  dangerouslySetInnerHTML={{ __html: pageContent }}
                />
              </div>
            )}

          </div>
        )}

        {/* Skeleton Loader */}
        {!page && !error && !notFound && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-10 shadow-xs animate-pulse space-y-4">
            <div className="h-7 bg-slate-100 rounded-xl w-1/3" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-4/5" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
          </div>
        )}

      </div>
    </div>
  );
}
