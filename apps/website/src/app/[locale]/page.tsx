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
  Link2, BookMarked, BadgeCheck, Landmark, School,
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
    fetchContent<Institution>("/institution").then(setInstitution).catch(() => { });
    fetchContent<Slider[]>("/sliders").then((d) => setSliders(d ?? [])).catch(() => { });
    fetchContent<{ students: number; staff: number }>("/stats").then(setStats).catch(() => { });
    fetchContent<Notice[]>("/notices", { limit: "10" }).then((d) => setNotices(d ?? [])).catch(() => { });
    fetchContent<GalleryAlbum[]>("/gallery/albums", { limit: "4" }).then((d) => setAlbums(d ?? [])).catch(() => { });
    fetchContent<EventItem[]>("/events", { upcoming: "true", limit: "3" }).then((d) => setEvents(d ?? [])).catch(() => { });
    fetchContent<AdmissionCycleSummary[]>("/admission/open").then((d) => setOpenCycles(d ?? [])).catch(() => { });
    fetchContent<GoverningBodyMember[]>("/governing-body").then((d) => setGoverningBody((d ?? []).slice(0, 5))).catch(() => { });
    fetchContent<FacultyMember[]>("/faculty", { category: "FACULTY" }).then((d) => setFaculty((d ?? []).slice(0, 8))).catch(() => { });
    fetchContent<StaticPageContent>("/pages/principal_message").then(setPrincipalMessage).catch(() => { });
  }, []);

  useEffect(() => {
    if (sliders.length < 2) return;
    const interval = setInterval(() => setSlideIndex((i) => (i + 1) % sliders.length), 6000);
    return () => clearInterval(interval);
  }, [sliders.length]);

  const chairman = governingBody[0] ?? null;
  const otherMembers = governingBody.slice(1);

  return (
    <main className="min-h-screen bg-[#f0fdf4] pb-10">

      {/* ── Hero Slider ── */}
      {sliders.length > 0 ? (
        <section className="relative h-[480px] w-full overflow-hidden bg-slate-900 md:h-[600px] lg:h-[700px]">
          {sliders.map((s, i) => (
            <div key={s.id} className={`absolute inset-0 transition-all duration-1000 ${i === slideIndex ? "opacity-100 scale-100" : "opacity-0 scale-105"}`}>
              <Image src={s.image_url} alt={s.title ?? ""} fill sizes="100vw" priority={i === 0} className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 sm:p-12">
                <div className="max-w-4xl space-y-6">
                  {s.title && <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white tracking-tight drop-shadow-md">{s.title}</h2>}
                  {s.subtitle && <p className="text-lg sm:text-xl lg:text-2xl text-slate-200 max-w-2xl mx-auto">{s.subtitle}</p>}
                  {s.btn_text && s.btn_link && (
                    <Button asChild size="lg" className="mt-8 rounded-full text-base px-8 h-14 font-semibold">
                      <a href={s.btn_link}>{s.btn_text} <ArrowRight className="ml-2 h-5 w-5" /></a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {sliders.length > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3 z-10">
              {sliders.map((_, i) => (
                <button key={i} onClick={() => setSlideIndex(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${i === slideIndex ? "w-8 bg-primary" : "w-2.5 bg-white/50 hover:bg-white/80"}`}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="relative flex h-[380px] sm:h-[480px] items-center justify-center bg-white overflow-hidden border-b border-green-100">
          <div
            className="absolute inset-0 z-0 opacity-[0.12]"
            style={{ backgroundImage: "radial-gradient(#16a34a 1.5px, transparent 1.5px)", backgroundSize: "28px 28px" }}
          />
          <div className="relative z-10 text-center px-4 max-w-3xl">
            {institution?.logo_url && (
              <div className="mx-auto mb-6 h-24 w-24 overflow-hidden rounded-full bg-white p-1.5 shadow-xl ring-4 ring-green-100">
                <Image src={institution.logo_url} alt="" width={96} height={96} className="h-full w-full rounded-full object-contain" />
              </div>
            )}
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">{institution?.name_en ?? t("welcome")}</h2>
            {institution?.tagline_en && <p className="text-lg sm:text-xl text-slate-500 font-medium">{institution.tagline_en}</p>}
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Stats Strip ── */}
        <section className="relative -mt-16 sm:-mt-24 mb-12 grid grid-cols-2 gap-4 md:grid-cols-4 z-20">
          <StatCard icon={Users} label={t("students")} value={stats?.students ?? "-"} color="text-green-600" />
          <StatCard icon={UserCheck} label={t("teachers")} value={stats?.staff ?? "-"} color="text-emerald-600" />
          <StatCard icon={Building2} label={t("founded")} value={institution?.founded_year ?? "-"} color="text-teal-600" />
          <StatCard icon={MapPin} label={t("eiin")} value={institution?.eiin ?? "-"} color="text-green-700" />
        </section>

      </div>

      {/* ── About the Institution ── */}
      <section className="bg-white border-y border-green-100 py-8 mb-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Logo */}
            <div className="shrink-0">
              {institution?.logo_url ? (
                <div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-green-200 shadow-sm bg-white">
                  <Image src={institution.logo_url} alt="logo" width={80} height={80} className="h-full w-full object-contain p-1" />
                </div>
              ) : (
                <div className="h-20 w-20 flex items-center justify-center rounded-full bg-green-50 ring-2 ring-green-200 text-3xl">🏫</div>
              )}
            </div>
            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg font-bold text-slate-900 mb-1">{institution?.name_en ?? "Our Institution"}</h2>
              <p className="text-sm italic text-slate-500 leading-relaxed line-clamp-2">
                {institution?.mission_text ?? "Committed to academic excellence and holistic development of students."}
              </p>
            </div>
            {/* Feature Pills */}
            <div className="flex flex-wrap justify-center sm:justify-end gap-2 shrink-0">
              {institution?.founded_year && (
                <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                  <Landmark className="h-3.5 w-3.5" /> Est. {institution.founded_year}
                </span>
              )}
              <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                <BadgeCheck className="h-3.5 w-3.5" /> Govt. Approved
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                <School className="h-3.5 w-3.5" /> SSC &amp; HSC
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Admission Banner ── */}
      {openCycles.length > 0 && (
        <section className="w-full bg-white py-8 sm:py-10 mb-10 border-y border-green-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 mb-2">
                {openCycles.length} Classes Open
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {t("admissionOpen", { className: "" }).replace(/[—\-]/g, "").trim()}
              </h2>
              <p className="text-slate-500 text-sm mt-1">Select a class below to start your application</p>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(openCycles.length, 3)}, minmax(0, 1fr))` }}>
              {openCycles.map((c) => (
                <div key={c.id} className="bg-[#f0fdf4] rounded-2xl border border-green-100 p-5 flex flex-col gap-3 hover:shadow-md hover:border-green-200 transition-all group">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-green-700 transition-colors">{c.class.name_en}</h3>
                    <div className="text-sm text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {c.seat_count} Seats</span>
                      <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {new Date(c.close_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 rounded-full font-semibold mt-auto">
                    <Link href={`/admission/${c.id}`}>{t("applyNow")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Notice Board + Principal's Message ── */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mb-14">

          {/* Notice Board (2/3) */}
          <section className="lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                {t("noticeBoard")}
              </h2>
              <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 text-sm">
                <Link href="/notices">{t("viewAll")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
            <div className="rounded-2xl border border-green-100 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
              <NoticeBoardWidget notices={notices} />
            </div>
          </section>

          {/* Principal's Message (1/3) */}
          <section className="flex flex-col">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-5">
              <MessageSquare className="h-5 w-5 text-primary" />
              {t("principalsMessage")}
            </h2>
            <div className="rounded-2xl border border-green-100 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
              {/* Green top accent line */}
              <div className="h-1 bg-primary w-full shrink-0" />
              <div className="p-6 flex flex-col flex-1">
                {/* Photo + Name */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-14 w-14 shrink-0 rounded-full overflow-hidden ring-2 ring-green-100 bg-green-50">
                  <div className="h-full w-full flex items-center justify-center text-primary">
                    <Quote className="h-6 w-6" />
                  </div>
                </div>
                  <div>
                    <p className="font-bold text-slate-900 leading-tight text-sm">{institution?.principal_name ?? t("principalFallback")}</p>
                    <p className="text-xs font-semibold text-primary mt-0.5">{institution?.principal_designation ?? "Principal"}</p>
                  </div>
                </div>
                {/* Quote */}
                <p className="text-sm leading-relaxed text-slate-600 italic flex-1 line-clamp-6">
                  &ldquo;{principalMessage?.content_en ? stripHtml(principalMessage.content_en) : (institution?.mission_text ?? t("welcomeMessage"))}&rdquo;
                </p>
                <Link href="/about/principal_message" className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 mt-4">
                  {t("readMore")} <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* ── Governing Body ── */}
        {governingBody.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {t("governingBody")}
              </h2>
              <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 text-sm">
                <Link href="/governing-body">{t("viewAll")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
              {/* Chairman — Featured Card */}
              {chairman && (
                <div className="lg:w-64 shrink-0 bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden flex flex-row lg:flex-col items-center gap-4 p-5 border-l-4 border-l-primary">
                  <div className="h-16 w-16 lg:h-24 lg:w-24 shrink-0 rounded-full overflow-hidden ring-2 ring-green-100 bg-green-50">
                    {chairman.photo_url ? (
                      <Image src={chairman.photo_url} alt={chairman.name} width={96} height={96} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-primary/40"><Users className="h-8 w-8" /></div>
                    )}
                  </div>
                  <div className="lg:text-center">
                    <p className="font-bold text-slate-900 text-sm leading-tight">{chairman.name}</p>
                    <p className="text-xs text-primary font-semibold mt-1">{chairman.designation}</p>
                  </div>
                </div>
              )}

              {/* Other Members — Directory List */}
              {otherMembers.length > 0 && (
                <div className="flex-1 bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden divide-y divide-slate-100">
                  {otherMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-green-50/50 transition-colors">
                      <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden ring-1 ring-green-100 bg-green-50">
                        {m.photo_url ? (
                          <Image src={m.photo_url} alt={m.name} width={40} height={40} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-primary/40"><Users className="h-4 w-4" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500 font-medium">{m.designation}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Teachers (Horizontal Scroll) ── */}
        {faculty.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                {t("teachers")}
              </h2>
              <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 text-sm">
                <Link href="/faculty">{t("viewAll")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory scroll-smooth">
              {faculty.map((f) => (
                <Link
                  key={f.id}
                  href={`/faculty/${f.id}`}
                  className="snap-start shrink-0 w-36 sm:w-40 bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden hover:border-green-300 hover:shadow-md transition-all group"
                >
                  <div className="h-1 bg-primary w-full" />
                  <div className="p-4 text-center">
                    <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full ring-2 ring-green-100 bg-green-50 group-hover:ring-green-300 transition-all">
                      {f.photo_url ? (
                        <Image src={f.photo_url} alt={f.name_en} width={64} height={64} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-primary/40"><GraduationCap className="h-7 w-7" /></div>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{f.name_en}</p>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{f.designation}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Gallery ── */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              {t("photoGallery")}
            </h2>
            <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 text-sm">
              <Link href="/gallery">{t("viewGallery")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>

          {albums.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {albums.map((a) => (
                <Link key={a.id} href={`/gallery/${a.id}`}
                  className="group relative block overflow-hidden rounded-2xl bg-slate-100 aspect-[4/3] shadow-sm hover:shadow-lg transition-all"
                >
                  {a.cover_url ? (
                    <Image src={a.cover_url} alt={a.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition-transform duration-700 group-hover:scale-110" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-green-50">
                      <ImageIcon className="h-10 w-10 text-green-200" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  {/* Photo count badge */}
                  {(a._count?.images ?? 0) > 0 && (
                    <span className="absolute top-3 right-3 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[11px] font-bold text-white flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" /> {a._count!.images}
                    </span>
                  )}
                  {/* Album name */}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="text-sm font-bold text-white line-clamp-2 leading-snug">{a.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Link href="/gallery"
              className="group flex items-center gap-5 rounded-2xl border border-green-100 bg-white p-6 hover:border-green-300 hover:shadow-md transition-all"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-50 group-hover:bg-primary/10 transition-colors">
                <ImageIcon className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-bold text-slate-800 group-hover:text-primary transition-colors">Explore Our Photo Gallery</p>
                <p className="text-sm text-slate-500 mt-0.5">View albums from school events, programs, and campus life</p>
              </div>
              <ArrowRight className="ml-auto h-5 w-5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
            </Link>
          )}
        </section>
        {/* ── Events + Important Links ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Upcoming Events */}
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {t("upcomingEvents")}
                </h2>
                <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 text-sm">
                  <Link href="/events">{t("viewAll")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {!events.length && (
                  <Link href="/events" className="group flex items-center gap-5 rounded-2xl border border-green-100 bg-white p-5 hover:border-green-300 hover:shadow-md transition-all">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-50 group-hover:bg-primary/10 transition-colors">
                      <CalendarDays className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 group-hover:text-primary transition-colors">No Upcoming Events Right Now</p>
                      <p className="text-sm text-slate-500 mt-0.5">Click to browse past and upcoming school events</p>
                    </div>
                    <ArrowRight className="ml-auto h-5 w-5 text-slate-400 group-hover:text-primary shrink-0" />
                  </Link>
                )}
                {events.map((e) => (
                  <Link key={e.id} href="/events" className="group flex items-center gap-4 rounded-2xl border border-green-100 bg-white p-4 shadow-sm transition-all hover:border-green-200 hover:shadow-md">
                    <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-green-50 py-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <span className="text-[9px] font-bold uppercase tracking-wider">
                        {new Date(e.date_from).toLocaleDateString(undefined, { month: "short" })}
                      </span>
                      <span className="text-xl font-black leading-none mt-0.5">
                        {new Date(e.date_from).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-800 text-sm group-hover:text-primary transition-colors">{e.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {e.date_to && e.date_to !== e.date_from
                          ? `${new Date(e.date_from).toLocaleDateString()} – ${new Date(e.date_to).toLocaleDateString()}`
                          : new Date(e.date_from).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="hidden sm:block shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      {e.type}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Important Links */}
            <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-green-100 shadow-sm">
              <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-4">
                <BookMarked className="h-5 w-5 text-primary" />
                {tf("importantLinks")}
              </h2>
              <div className="flex flex-col gap-2">
                {[
                  { name_en: "Ministry of Education", name_bn: "শিক্ষা মন্ত্রণালয়", url: "https://moedu.gov.bd" },
                  { name_en: "DSHE", name_bn: "মাধ্যমিক ও উচ্চ মাধ্যমিক শিক্ষা অধিদপ্তর", url: "http://www.dshe.gov.bd" },
                  { name_en: "Education Board Results", name_bn: "পরীক্ষার রেজাল্ট", url: "http://www.educationboardresults.gov.bd" },
                  { name_en: "BANBEIS", name_bn: "ব্যানবেইস", url: "http://www.banbeis.gov.bd" },
                  { name_en: "NAEM", name_bn: "নায়েম", url: "http://www.naem.gov.bd" },
                  { name_en: "NCTB", name_bn: "এনসিটিবি", url: "http://www.nctb.gov.bd" },
                  { name_en: "Teachers Portal", name_bn: "শিক্ষক বাতায়ন", url: "https://www.teachers.gov.bd" },
                  { name_en: "Kishor Batayon", name_bn: "কিশোর বাতায়ন", url: "http://konnect.edu.bd" },
                ].map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#f0fdf4] px-4 py-2.5 border border-green-100 transition-all hover:border-green-300 hover:bg-green-50 group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Link2 className="h-3.5 w-3.5 text-primary shrink-0 -rotate-45" />
                      <span className="text-sm font-semibold text-slate-700 group-hover:text-green-800 transition-colors truncate">
                        {locale === "bn" ? link.name_bn : link.name_en}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-0.5 text-[10px] sm:text-xs font-bold text-green-700 ring-1 ring-green-200 group-hover:bg-green-100 transition-colors">
                      {locale === "bn" ? "ভিজিট করুন" : "Visit"}
                    </span>
                  </a>
                ))}
              </div>
            </section>
        </div>

      </div>
    </main>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: LucideIcon; color: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-md shadow-green-100 ring-1 ring-green-100 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-green-100">
      <div className="absolute -right-4 -top-4 rounded-full bg-green-50 p-6 transition-transform duration-500 group-hover:scale-150">
        <Icon className={`h-8 w-8 opacity-20 ${color}`} />
      </div>
      <div className="relative z-10">
        <Icon className={`h-6 w-6 mb-4 ${color}`} />
        <p className="text-3xl font-black tracking-tight text-slate-800">{value}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  );
}
