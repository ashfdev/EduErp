"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import { NoticeBoardWidget } from "@/components/notice-board-widget";
import type { Institution, Slider, Notice, GalleryAlbum, EventItem, AdmissionCycleSummary, GoverningBodyMember, FacultyMember, StaticPageContent } from "@/lib/types";
import {
  Users, UserCheck, CalendarDays, BookOpen,
  ChevronRight, Megaphone, ArrowRight, Image as ImageIcon,
  GraduationCap, Download, MapPin, Building2, MessageSquare, Quote,
  Link2, BookMarked,
  type LucideIcon
} from "lucide-react";
import { Button } from "@education-erp/ui";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function HomePage() {
  const t = useTranslations("home");
  const tf = useTranslations("footer");
  const locale = useLocale();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [sliders, setSliders] = useState<Slider[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [stats, setStats] = useState<{ students: number; staff: number } | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [openCycles, setOpenCycles] = useState<AdmissionCycleSummary[]>([]);
  const [governingBody, setGoverningBody] = useState<GoverningBodyMember[]>([]);
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [principalMessage, setPrincipalMessage] = useState<StaticPageContent | null>(null);

  useEffect(() => {
    // Each section below is independently optional (a marketing homepage
    // mosaic, not one primary content fetch) — a failure in any single one
    // just leaves that section at its already-empty initial state rather
    // than blocking the rest of the page. fetchContent throws on failure
    // now (used to silently resolve to null), so every call needs an
    // explicit .catch() to avoid an unhandled rejection.
    fetchContent<Institution>("/institution").then(setInstitution).catch(() => { });
    fetchContent<Slider[]>("/sliders").then((d) => setSliders(d ?? [])).catch(() => { });
    fetchContent<{ students: number; staff: number }>("/stats").then(setStats).catch(() => { });
    fetchContent<Notice[]>("/notices", { limit: "10" }).then((d) => setNotices(d ?? [])).catch(() => { });
    fetchContent<GalleryAlbum[]>("/gallery/albums", { limit: "4" }).then((d) => setAlbums(d ?? [])).catch(() => { });
    fetchContent<EventItem[]>("/events", { upcoming: "true", limit: "3" }).then((d) => setEvents(d ?? [])).catch(() => { });
    fetchContent<AdmissionCycleSummary[]>("/admission/open").then((d) => setOpenCycles(d ?? [])).catch(() => { });
    fetchContent<GoverningBodyMember[]>("/governing-body").then((d) => setGoverningBody((d ?? []).slice(0, 4))).catch(() => { });
    fetchContent<FacultyMember[]>("/faculty", { category: "FACULTY" }).then((d) => setFaculty((d ?? []).slice(0, 4))).catch(() => { });
    fetchContent<StaticPageContent>("/pages/principal_message").then(setPrincipalMessage).catch(() => { });
  }, []);

  useEffect(() => {
    if (sliders.length < 2) return;
    const interval = setInterval(() => setSlideIndex((i) => (i + 1) % sliders.length), 6000);
    return () => clearInterval(interval);
  }, [sliders.length]);

  const QUICK_LINKS = [
    { href: "/academic/policies", icon: BookOpen, labelKey: "quickPolicies", color: "text-blue-500", bg: "bg-blue-50" },
    { href: "/faculty", icon: Users, labelKey: "quickFaculty", color: "text-indigo-500", bg: "bg-indigo-50" },
    { href: "/academic/course_curriculum", icon: GraduationCap, labelKey: "quickCurriculum", color: "text-purple-500", bg: "bg-purple-50" },
    { href: "/events", icon: CalendarDays, labelKey: "quickCalendar", color: "text-orange-500", bg: "bg-orange-50" },
    { href: "/downloads", icon: Download, labelKey: "quickDownloads", color: "text-emerald-500", bg: "bg-emerald-50" },
    { href: "/admission", icon: UserCheck, labelKey: "quickAdmission", color: "text-rose-500", bg: "bg-rose-50" },
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 pb-20">

      {/* Hero Slider */}
      {sliders.length > 0 ? (
        <section className="relative h-[480px] w-full overflow-hidden bg-slate-900 md:h-[600px] lg:h-[700px]">
          {sliders.map((s, i) => (
            <div key={s.id} className={`absolute inset-0 transition-all duration-1000 ${i === slideIndex ? "opacity-100 scale-100" : "opacity-0 scale-105"}`}>
              <Image src={s.image_url} alt={s.title ?? ""} fill sizes="100vw" priority={i === 0} className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 sm:p-12">
                <div className="max-w-4xl space-y-6 transform transition-all duration-700 translate-y-0 opacity-100">
                  {s.title && <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white tracking-tight drop-shadow-md">{s.title}</h2>}
                  {s.subtitle && <p className="text-lg sm:text-xl lg:text-2xl text-slate-200 max-w-2xl mx-auto drop-shadow">{s.subtitle}</p>}
                  {s.btn_text && s.btn_link && (
                    <Button asChild size="lg" className="mt-8 rounded-full text-base px-8 h-14 font-semibold shadow-xl shadow-primary/25 transition-transform hover:scale-105">
                      <a href={s.btn_link}>
                        {s.btn_text} <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {sliders.length > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3 z-10">
              {sliders.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIndex(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${i === slideIndex ? "w-8 bg-primary" : "w-2.5 bg-white/50 hover:bg-white/80"}`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="relative flex h-[380px] sm:h-[480px] items-center justify-center bg-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-secondary z-0" />
          <div
            className="absolute inset-0 z-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.6) 1.5px, transparent 1.5px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-transparent to-transparent z-0" />
          <div className="relative z-10 text-center px-4 max-w-3xl">
            {institution?.logo_url && (
              <div className="mx-auto mb-6 h-24 w-24 overflow-hidden rounded-full bg-white p-1.5 shadow-xl ring-4 ring-white/20">
                <Image src={institution.logo_url} alt="" width={96} height={96} className="h-full w-full rounded-full object-contain" />
              </div>
            )}
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white drop-shadow-md mb-4 tracking-tight">{institution?.name_en ?? t("welcome")}</h2>
            {institution?.tagline_en && <p className="text-lg sm:text-xl text-white/90 font-medium">{institution.tagline_en}</p>}
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Quick Stats - Pulled up overlapping the hero */}
        <section className="relative -mt-16 sm:-mt-24 mb-16 grid grid-cols-2 gap-4 md:grid-cols-4 z-20">
          <StatCard icon={Users} label={t("students")} value={stats?.students ?? "-"} color="text-blue-600" />
          <StatCard icon={UserCheck} label={t("teachers")} value={stats?.staff ?? "-"} color="text-indigo-600" />
          <StatCard icon={Building2} label={t("founded")} value={institution?.founded_year ?? "-"} color="text-purple-600" />
          <StatCard icon={MapPin} label={t("eiin")} value={institution?.eiin ?? "-"} color="text-rose-600" />
        </section>
      </div>

      {/* Admission Banner */}
      {openCycles.length > 0 && (
        <section className="w-full bg-slate-50/80 py-12 sm:py-16 mb-12 sm:mb-16 border-y border-slate-200/60">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 mb-3">
                {openCycles.length} {t("seats") ? "Classes Open" : "Classes Open"}
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                {t("admissionOpen", { className: "" }).replace(/[—\-]/g, "").trim()}
              </h2>
              <p className="text-slate-500 mt-2 text-sm sm:text-base">Select a class below to start your application</p>
            </div>
            
            <div className="flex flex-col gap-3">
              {openCycles.map((c) => (
                <div key={c.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md hover:border-blue-100 transition-all group">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{c.class.name_en}</h3>
                    <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {c.seat_count} {t("seats") ? "Seats" : "Seats"}</span>
                      <span className="text-slate-300 hidden sm:block">•</span>
                      <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {new Date(c.close_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full sm:w-auto shrink-0 border-slate-200 text-slate-700 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 rounded-full px-6 font-semibold transition-colors">
                    <Link href={`/admission/${c.id}`}>{t("applyNow")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              ))}
            </div>
            
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Content: Notices & Principal */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mb-12">
          {/* Left Column: Notices */}
          <section className="lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                <Megaphone className="h-7 w-7 text-primary" />
                {t("noticeBoard")}
              </h2>
              <Button variant="ghost" asChild className="text-primary hover:bg-primary/10">
                <Link href="/notices">{t("viewAll")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
              <NoticeBoardWidget notices={notices} />
            </div>
          </section>

          {/* Right Column: Principal */}
          <section className="flex flex-col">
            <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2 mb-6">
              <MessageSquare className="h-6 w-6 text-primary" />
              {t("principalsMessage")}
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm relative overflow-hidden group flex-1">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary to-secondary"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-0 transition-transform group-hover:scale-110"></div>
              <div className="relative z-10 h-full flex flex-col">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md">
                    <Quote className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-slate-800 leading-tight">{institution?.principal_name ?? t("principalFallback")}</p>
                    <p className="text-sm font-medium text-primary">{institution?.principal_designation}</p>
                  </div>
                </div>
                <p className="line-clamp-4 text-sm leading-relaxed text-slate-600 mb-4 italic flex-1">
                  &ldquo;{principalMessage?.content_en ? stripHtml(principalMessage.content_en) : (institution?.mission_text ?? t("welcomeMessage"))}&rdquo;
                </p>
                <Link href="/about/principal_message" className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 mt-auto">
                  {t("readMore")} <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        </div>



        {/* Governing Body & Teachers */}
        {(governingBody.length > 0 || faculty.length > 0) && (
          <div className="grid grid-cols-1 gap-12 mb-20 lg:grid-cols-2 items-start">
            {governingBody.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                    <Users className="h-6 w-6 text-primary" />
                    {t("governingBody")}
                  </h2>
                  <Button variant="ghost" asChild className="text-primary hover:bg-primary/10">
                    <Link href="/governing-body">{t("viewAll")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {governingBody.map((m) => (
                    <div key={m.id} className="group rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
                      <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 group-hover:ring-primary/30 transition-all">
                        {m.photo_url ? (
                          <Image src={m.photo_url} alt={m.name} width={64} height={64} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-primary/40">
                            <Users className="h-7 w-7" />
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs font-bold text-slate-800">{m.name}</p>
                      <p className="line-clamp-2 text-[11px] text-slate-500">{m.designation}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {faculty.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                    <GraduationCap className="h-6 w-6 text-primary" />
                    {t("teachers")}
                  </h2>
                  <Button variant="ghost" asChild className="text-primary hover:bg-primary/10">
                    <Link href="/faculty">{t("viewAll")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {faculty.map((f) => (
                    <Link key={f.id} href={`/faculty/${f.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md hover:border-primary/30">
                      <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 group-hover:ring-primary/30 transition-all">
                        {f.photo_url ? (
                          <Image src={f.photo_url} alt={f.name_en} width={64} height={64} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-primary/40">
                            <GraduationCap className="h-7 w-7" />
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs font-bold text-slate-800">{f.name_en}</p>
                      <p className="line-clamp-2 text-[11px] text-slate-500">{f.designation}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Gallery & Events */}
        <div className={`grid grid-cols-1 gap-12 mb-20 items-start ${albums.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-4xl mx-auto"}`}>
          {/* Gallery Preview */}
          {albums.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                  <ImageIcon className="h-6 w-6 text-primary" />
                  {t("photoGallery")}
                </h2>
                <Button variant="ghost" asChild className="text-primary hover:bg-primary/10">
                  <Link href="/gallery">{t("viewGallery")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {albums.map((a, i) => (
                  <Link
                    key={a.id}
                    href={`/gallery/${a.id}`}
                    className={`group relative block overflow-hidden rounded-2xl bg-slate-100 ${i === 0 ? "col-span-2 aspect-[21/9]" : "aspect-[4/3]"}`}
                  >
                    {a.cover_url && (
                      <Image src={a.cover_url} alt={a.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-110" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <span className="text-sm font-semibold text-white line-clamp-1">{a.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Right Column: Events + Quick Links */}
          <div className="flex flex-col gap-12">
            {/* Upcoming Events */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                  <CalendarDays className="h-6 w-6 text-primary" />
                  {t("upcomingEvents")}
                </h2>
                <Button variant="ghost" asChild className="text-primary hover:bg-primary/10">
                  <Link href="/events">{t("viewAll")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
              <div className="flex flex-col gap-4">
                {!events.length && (
                  <div className="rounded-2xl border border-slate-200 border-dashed p-8 text-center bg-white">
                    <p className="text-sm text-slate-500">{t("noUpcomingEvents")}</p>
                  </div>
                )}
                {events.map((e) => (
                  <Link key={e.id} href="/events" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/5 py-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {new Date(e.date_from).toLocaleDateString(undefined, { month: "short" })}
                      </span>
                      <span className="text-2xl font-black leading-none mt-1">
                        {new Date(e.date_from).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-800 group-hover:text-primary transition-colors">{e.name}</p>
                      <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {e.date_to && e.date_to !== e.date_from
                          ? `${new Date(e.date_from).toLocaleDateString()} – ${new Date(e.date_to).toLocaleDateString()}`
                          : new Date(e.date_from).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="hidden sm:block shrink-0">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {e.type}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Important Links */}
            <section className="space-y-4 bg-slate-50/80 p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-[0_2px_15px_rgb(0,0,0,0.03)]">
              <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center justify-center gap-3 mb-6">
                <BookMarked className="h-6 w-6 text-slate-700" />
                {tf("importantLinks")}
              </h2>
              <div className="flex flex-col gap-2.5">
                {[
                  { name_en: "Ministry of Education", name_bn: "শিক্ষা মন্ত্রণালয়", url: "https://moedu.gov.bd" },
                  { name_en: "DSHE", name_bn: "মাধ্যমিক ও উচ্চ মাধ্যমিক শিক্ষা অধিদপ্তর", url: "http://www.dshe.gov.bd" },
                  { name_en: "Education Board Results", name_bn: "পরীক্ষার রেজাল্ট", url: "http://www.educationboardresults.gov.bd" },
                  { name_en: "BANBEIS", name_bn: "ব্যানবেইস", url: "http://www.banbeis.gov.bd" },
                  { name_en: "NAEM", name_bn: "নায়েম", url: "http://www.naem.gov.bd" },
                  { name_en: "NCTB", name_bn: "এনসিটিবি", url: "http://www.nctb.gov.bd" },
                  { name_en: "Teachers Portal", name_bn: "শিক্ষক বাতায়ন", url: "https://www.teachers.gov.bd" },
                  { name_en: "Kishor Batayon", name_bn: "কিশোর বাতায়ন", url: "http://konnect.edu.bd" },
                ].map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 border border-slate-100 transition-all hover:border-blue-200 hover:shadow-sm group"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <Link2 className="h-4 w-4 text-orange-500 group-hover:text-orange-600 shrink-0 -rotate-45 transition-colors" />
                      <span className="text-sm font-bold text-slate-700 leading-tight group-hover:text-blue-700 transition-colors truncate">
                        {locale === "bn" ? link.name_bn : link.name_en}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] sm:text-xs font-bold text-blue-600 ring-1 ring-blue-200/50 group-hover:bg-blue-100 transition-colors">
                      {locale === "bn" ? "ভিজিট করুন" : "Visit"}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>

      </div>
    </main>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: LucideIcon; color: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-xl shadow-black/5 ring-1 ring-slate-100 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/10">
      <div className={`absolute -right-4 -top-4 rounded-full bg-slate-50 p-6 transition-transform duration-500 group-hover:scale-150`}>
        <Icon className={`h-8 w-8 opacity-20 ${color}`} />
      </div>
      <div className="relative z-10">
        <Icon className={`h-6 w-6 mb-4 ${color}`} />
        <p className={`text-3xl font-black tracking-tight text-slate-800`}>{value}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  );
}
