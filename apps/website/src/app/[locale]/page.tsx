"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import { NoticeBoardWidget } from "@/components/notice-board-widget";
import type { Institution, Slider, Notice, GalleryAlbum, EventItem, AdmissionCycleSummary, GoverningBodyMember, FacultyMember } from "@/lib/types";
import {
  Users, UserCheck, CalendarDays, BookOpen,
  ChevronRight, Megaphone, ArrowRight, Image as ImageIcon,
  GraduationCap, Download, MapPin, Building2, MessageSquare,
  type LucideIcon
} from "lucide-react";
import { Button } from "@education-erp/ui";

export default function HomePage() {
  const t = useTranslations("home");
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

  useEffect(() => {
    fetchContent<Institution>("/institution").then(setInstitution);
    fetchContent<Slider[]>("/sliders").then((d) => setSliders(d ?? []));
    fetchContent<{ students: number; staff: number }>("/stats").then(setStats);
    fetchContent<Notice[]>("/notices", { limit: "10" }).then((d) => setNotices(d ?? []));
    fetchContent<GalleryAlbum[]>("/gallery/albums", { limit: "4" }).then((d) => setAlbums(d ?? []));
    fetchContent<EventItem[]>("/events", { upcoming: "true", limit: "3" }).then((d) => setEvents(d ?? []));
    fetchContent<AdmissionCycleSummary[]>("/admission/open").then((d) => setOpenCycles(d ?? []));
    fetchContent<GoverningBodyMember[]>("/governing-body").then((d) => setGoverningBody((d ?? []).slice(0, 4)));
    fetchContent<Record<string, FacultyMember[]>>("/faculty").then((d) => setFaculty(Object.values(d ?? {}).flat().slice(0, 4)));
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
      {/* Notice Ticker */}
      {notices.length > 0 && (
        <div className="bg-primary text-primary-foreground overflow-hidden py-2 text-sm font-medium">
          <div className="flex animate-[ticker_40s_linear_infinite] gap-12 whitespace-nowrap px-4 hover:[animation-play-state:paused]">
            {[...notices, ...notices].map((n, i) => (
              <Link key={`${n.id}-${i}`} href="/notices" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                {n.is_pinned ? <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase">Pinned</span> : <Megaphone className="h-3 w-3" />}
                {n.title}
              </Link>
            ))}
          </div>
        </div>
      )}

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
        <section className="relative flex h-[350px] sm:h-[450px] items-center justify-center bg-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-secondary/90 z-0" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 z-0" />
          <div className="relative z-10 text-center px-4">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white drop-shadow-md mb-4">{institution?.name_en ?? t("welcome")}</h2>
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

        {/* Admission Banner */}
        {openCycles.length > 0 && (
          <section className="mb-16">
            {openCycles.map((c) => (
              <div key={c.id} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-secondary p-8 sm:p-10 shadow-lg text-white flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="absolute -right-20 -top-20 opacity-10 blur-2xl">
                  <GraduationCap className="h-64 w-64" />
                </div>
                <div className="relative z-10 text-center sm:text-left">
                  <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3 backdrop-blur-md">Admissions Open</span>
                  <h3 className="text-2xl sm:text-3xl font-bold mb-2">{t("admissionOpen", { className: c.class.name_en })}</h3>
                  <p className="text-primary-foreground/90 font-medium">
                    {t("seatsCloses", { seats: c.seat_count, date: new Date(c.close_date).toLocaleDateString() })}
                  </p>
                </div>
                <Button asChild variant="secondary" size="lg" className="relative z-10 shrink-0 rounded-full font-bold px-8 shadow-xl">
                  <Link href={`/admission/${c.id}`}>{t("applyNow")}</Link>
                </Button>
              </div>
            ))}
          </section>
        )}

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
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-0 transition-transform group-hover:scale-110"></div>
              <div className="relative z-10 h-full flex flex-col">
                <p className="font-bold text-lg text-slate-800">{institution?.principal_name ?? t("principalFallback")}</p>
                <p className="text-sm font-medium text-primary mb-4">{institution?.principal_designation}</p>
                <p className="line-clamp-4 text-sm leading-relaxed text-slate-600 mb-4 italic flex-1">
                  &ldquo;{institution?.mission_text ?? t("welcomeMessage")}&rdquo;
                </p>
                <Link href="/about/principal_message" className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80 mt-auto">
                  {t("readMore")} <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* Quick Links (Full Width) */}
        <section className="mb-16">
          <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-6">{t("quickLinks")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {QUICK_LINKS.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-center transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-1 group"
              >
                <div className={`rounded-full p-3 ${q.bg} ${q.color} transition-transform group-hover:scale-110`}>
                  <q.icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold text-slate-700">{t(q.labelKey)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Governing Body & Teachers */}
        {(governingBody.length > 0 || faculty.length > 0) && (
          <div className="grid grid-cols-1 gap-12 mb-20 lg:grid-cols-2">
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
                <div className="flex flex-wrap gap-4">
                  {governingBody.map((m) => (
                    <div key={m.id} className="w-24 text-center">
                      <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                        {m.photo_url && <Image src={m.photo_url} alt={m.name} width={64} height={64} className="h-full w-full object-cover" />}
                      </div>
                      <p className="mt-2 truncate text-xs font-bold text-slate-700">{m.name}</p>
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
                <div className="flex flex-wrap gap-4">
                  {faculty.map((f) => (
                    <div key={f.id} className="w-24 text-center">
                      <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                        {f.photo_url && <Image src={f.photo_url} alt={f.name_en} width={64} height={64} className="h-full w-full object-cover" />}
                      </div>
                      <p className="mt-2 truncate text-xs font-bold text-slate-700">{f.name_en}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Gallery & Events */}
        <div className={`grid grid-cols-1 gap-12 mb-20 ${albums.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-4xl mx-auto"}`}>
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
