"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import { NoticeBoardWidget } from "@/components/notice-board-widget";
import type { Institution, Slider, Notice, GalleryAlbum, EventItem, AdmissionCycleSummary, GoverningBodyMember, FacultyMember, StaticPageContent } from "@/lib/types";
import {
  Users,
  UserCheck,
  CalendarDays,
  ArrowRight,
  Megaphone,
  MapPin,
  Building2,
  BadgeCheck,
  Landmark,
  School,
  GraduationCap,
  Image as ImageIcon,
  BookMarked,
  Link2,
  type LucideIcon,
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

  return (
    <main className="min-h-screen bg-slate-50">

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
        <section className="relative flex h-[380px] sm:h-[480px] items-center justify-center bg-white overflow-hidden border-b border-primary/20">
          <div
            className="absolute inset-0 z-0 opacity-[0.12]"
            style={{ backgroundImage: "radial-gradient(#16a34a 1.5px, transparent 1.5px)", backgroundSize: "28px 28px" }}
          />
          <div className="relative z-10 text-center px-4 max-w-3xl">
            {institution?.logo_url && (
              <div className="mx-auto mb-6 h-24 w-24 overflow-hidden rounded-full bg-white p-1.5 shadow-xl ring-4 ring-primary/20">
                <Image src={institution.logo_url} alt="" width={96} height={96} className="h-full w-full rounded-full object-contain" />
              </div>
            )}
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">{institution?.name_en ?? t("welcome")}</h2>
            {institution?.tagline_en && <p className="text-lg sm:text-xl text-slate-500 font-medium">{institution.tagline_en}</p>}
          </div>
        </section>
      )}

      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">

        {/* ── Stats Strip ── */}
        <section className="relative -mt-16 sm:-mt-24 mb-12 grid grid-cols-2 gap-4 md:grid-cols-4 z-20">
          <StatCard icon={Users} label={t("students")} value={stats?.students ?? "-"} color="text-secondary" />
          <StatCard icon={UserCheck} label={t("teachers")} value={stats?.staff ?? "-"} color="text-emerald-600" />
          <StatCard icon={Building2} label={t("founded")} value={institution?.founded_year ?? "-"} color="text-teal-600" />
          <StatCard icon={MapPin} label={t("eiin")} value={institution?.eiin ?? "-"} color="text-primary" />
        </section>

      </div>


      {/* ── About Institution + Notice Board ── */}
      <section className="bg-slate-50 py-12 sm:py-16">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

            {/* About Institution (2/3) */}
            <section className="lg:col-span-2 flex flex-col sm:justify-center relative sm:min-h-[550px] gap-0">
              {/* Background Image on Left */}
              <div className="relative w-full aspect-video sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2 sm:w-[55%] sm:aspect-[5/6] rounded-2xl overflow-hidden shadow-sm">
                <Image
                  src={(institution as { student_login_bg_url?: string })?.student_login_bg_url || institution?.logo_url || "https://picsum.photos/seed/institution/800/800"}
                  alt="Institution Building"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-slate-900/10" />
              </div>

              {/* Overlapping White Card */}
              <div className="relative flex flex-col justify-center sm:ml-[45%] bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-100 sm:my-8 sm:mr-4 z-10 -mt-12 sm:mt-0 mx-4 sm:mx-0">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-6 inline-block relative self-start">
                  {tf("aboutUs")}
                  <span className="absolute -bottom-2 left-0 h-1 w-12 bg-primary"></span>
                </h2>
                <p className="text-sm leading-relaxed text-slate-600 mb-8 whitespace-pre-line line-clamp-[8]">
                  {institution?.established_text || "Our institution is committed to providing quality education, nurturing young minds, and building a bright future for our students. We believe in holistic development and academic excellence."}
                </p>
                <div className="mt-auto self-start">
                  <Button asChild className="bg-primary/10 text-primary hover:bg-primary hover:text-white font-bold rounded-full px-6 transition-all">
                    <Link href="/about">{t("readMore")}</Link>
                  </Button>
                </div>
              </div>
            </section>

            {/* Notice Board (1/3) */}
            <section className="flex flex-col">
              <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-100 flex-1 flex flex-col relative overflow-hidden">
                <div className="flex items-center justify-center mb-6">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-red-500" />
                    {t("noticeBoard")}
                  </h2>
                </div>
                <div className="flex-1 overflow-hidden flex flex-col bg-transparent">
                  <NoticeBoardWidget notices={notices} />
                </div>
                <div className="mt-6 text-center">
                  <Button asChild className="bg-primary text-white hover:bg-primary/90 font-bold w-full rounded-md shadow-sm transition-all">
                    <Link href="/notices">{t("viewAll")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              </div>
            </section>

          </div>
        </div>
      </section>

      {/* ── Admission Banner ── */}
      {openCycles.length > 0 && (
        <section 
          className="w-full py-10 sm:py-12 border-y border-slate-100"
          style={{ backgroundColor: (institution as { admission_bg_color?: string } | null)?.admission_bg_color || "transparent" }}
        >
          <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
            <div className="mb-10 flex flex-col items-center text-center">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-3 border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse"></span>
                {openCycles.length} Classes Open
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
                {t("admissionOpen", { className: "" }).replace(/[—-]/g, "").trim()}
              </h2>
              <p className="text-slate-500 text-sm sm:text-base mt-3 max-w-xl">
                Select a class below to start your application process
              </p>
            </div>

            <div className="flex sm:grid overflow-x-auto sm:overflow-visible snap-x snap-mandatory gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
              {openCycles.map((c) => (
                <div key={c.id} className="min-w-[85vw] sm:min-w-0 snap-center shrink-0 sm:shrink bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex flex-col group">
                  <div className="mb-5">
                    <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors">
                      {c.class.name_en}
                    </h3>
                  </div>
                  
                  <div className="space-y-2.5 mb-6">
                    <div className="flex items-center text-slate-600 text-sm">
                      <Users className="h-4 w-4 mr-2.5 text-slate-400 group-hover:text-primary transition-colors" />
                      <span>{c.seat_count} Seats Available</span>
                    </div>
                    <div className="flex items-center text-slate-600 text-sm">
                      <CalendarDays className="h-4 w-4 mr-2.5 text-slate-400 group-hover:text-primary transition-colors" />
                      <span>Deadline: {new Date(c.close_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4 flex justify-center">
                    <Button asChild className="bg-primary text-white hover:bg-primary/90 font-semibold shadow-sm transition-all rounded-full px-8">
                      <Link href={`/admission/${c.id}`}>
                        {t("applyNow")}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Governing Body ── */}
      {governingBody.length > 0 && (
        <section className="bg-[#F5F7FA] py-12 sm:py-16">
          <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
            {/* Section title */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {t("governingBody")}
              </h2>
              <Button variant="ghost" asChild className="text-primary hover:bg-primary/10 text-sm">
                <Link href="/governing-body">{t("viewAll")} <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>

            {/* Simple card grid */}
            <div className="flex sm:grid overflow-x-auto sm:overflow-visible snap-x snap-mandatory gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
              {governingBody.map((m) => (
                <div key={m.id} className="min-w-[45vw] sm:min-w-0 snap-center shrink-0 sm:shrink bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col items-center text-center gap-3">
                  {/* Avatar */}
                  <div className="h-16 w-16 rounded-full overflow-hidden bg-slate-100 ring-2 ring-slate-200 shrink-0">
                    {m.photo_url ? (
                      <Image src={m.photo_url} alt={m.name} width={64} height={64} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-400">
                        <Users className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  {/* Name */}
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{m.name}</p>
                  {/* Designation — bold, prominent */}
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">{m.designation}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Teachers (Horizontal Scroll) ── */}
      {faculty.length > 0 && (
        <section className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
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
                  className="snap-start shrink-0 w-36 sm:w-40 bg-white rounded-2xl border border-primary/20 shadow-sm overflow-hidden hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="h-1 bg-primary w-full" />
                  <div className="p-4 text-center">
                    <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full ring-2 ring-primary/20 bg-primary/5 group-hover:ring-green-300 transition-all">
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
          </div>
        </section>
      )}

      {/* ── Gallery ── */}
      <section className="bg-[#F5F7FA] py-12 sm:py-16">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
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
                    <div className="h-full w-full flex items-center justify-center bg-primary/5">
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
              className="group flex items-center gap-5 rounded-2xl border border-primary/20 bg-white p-6 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/5 group-hover:bg-primary/10 transition-colors">
                <ImageIcon className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-bold text-slate-800 group-hover:text-primary transition-colors">Explore Our Photo Gallery</p>
                <p className="text-sm text-slate-500 mt-0.5">View albums from school events, programs, and campus life</p>
              </div>
              <ArrowRight className="ml-auto h-5 w-5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
            </Link>
          )}
        </div>
      </section>

      {/* ── Events + Important Links ── */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                  <Link href="/events" className="group flex items-center gap-5 rounded-2xl border border-primary/20 bg-white p-5 hover:border-primary/40 hover:shadow-md transition-all">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/5 group-hover:bg-primary/10 transition-colors">
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
                  <Link key={e.id} href="/events" className="group flex items-center gap-4 rounded-2xl border border-primary/20 bg-white p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/5 py-2 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
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
                    <span className="hidden sm:block shrink-0 rounded-full bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      {e.type}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Important Links */}
            <section className="space-y-3 bg-white p-5 sm:p-6 rounded-3xl border border-primary/20 shadow-sm">
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
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-2.5 border border-primary/20 transition-all hover:border-primary/40 hover:bg-primary/5 group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Link2 className="h-3.5 w-3.5 text-primary shrink-0 -rotate-45" />
                      <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors truncate">
                        {locale === "bn" ? link.name_bn : link.name_en}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-0.5 text-[10px] sm:text-xs font-bold text-primary ring-1 ring-primary/30 group-hover:bg-primary/15 transition-colors">
                      {locale === "bn" ? "ভিজিট করুন" : "Visit"}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: LucideIcon; color: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-md shadow-primary/10 ring-1 ring-primary/20 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10">
      <div className="absolute -right-4 -top-4 rounded-full bg-primary/5 p-6 transition-transform duration-500 group-hover:scale-150">
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
