"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import { NoticeBoardWidget } from "@/components/notice-board-widget";
import type { Institution, Slider, Notice, GalleryAlbum, EventItem, AdmissionCycleSummary, GoverningBodyMember, FacultyMember } from "@/lib/types";

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
    const interval = setInterval(() => setSlideIndex((i) => (i + 1) % sliders.length), 5000);
    return () => clearInterval(interval);
  }, [sliders.length]);

  const QUICK_LINKS = [
    { href: "/academic/policies", icon: "📋", labelKey: "quickPolicies" },
    { href: "/faculty", icon: "🎓", labelKey: "quickFaculty" },
    { href: "/academic/course_curriculum", icon: "📚", labelKey: "quickCurriculum" },
    { href: "/events", icon: "🗓️", labelKey: "quickCalendar" },
    { href: "/downloads", icon: "📥", labelKey: "quickDownloads" },
    { href: "/admission", icon: "✍️", labelKey: "quickAdmission" },
  ] as const;

  return (
    <main>
      {/* Hero Slider */}
      {sliders.length > 0 ? (
        <section className="relative h-[360px] w-full overflow-hidden bg-gray-200 md:h-[440px]">
          {sliders.map((s, i) => (
            <div key={s.id} className={`absolute inset-0 transition-opacity duration-700 ${i === slideIndex ? "opacity-100" : "opacity-0"}`}>
              <Image src={s.image_url} alt={s.title ?? ""} fill sizes="100vw" priority={i === 0} className="object-cover" />
              <div className="absolute inset-0 flex flex-col items-start justify-end bg-black/30 p-8 text-white">
                {s.title && <h2 className="text-3xl font-bold">{s.title}</h2>}
                {s.subtitle && <p className="mt-1 max-w-xl">{s.subtitle}</p>}
                {s.btn_text && s.btn_link && (
                  <a href={s.btn_link} className="mt-4 rounded-md px-4 py-2 text-sm font-medium" style={{ background: "var(--primary)" }}>
                    {s.btn_text}
                  </a>
                )}
              </div>
            </div>
          ))}
          {sliders.length > 1 && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
              {sliders.map((_, i) => (
                <button key={i} onClick={() => setSlideIndex(i)} className={`h-2 w-2 rounded-full ${i === slideIndex ? "bg-white" : "bg-white/50"}`} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="flex h-[240px] items-center justify-center bg-gray-100">
          <p className="text-gray-500">{institution?.name_en ?? t("welcome")}</p>
        </section>
      )}

      {/* Notice Ticker */}
      {notices.length > 0 && (
        <div className="overflow-hidden border-b bg-gray-50 py-2">
          <div className="flex animate-[ticker_30s_linear_infinite] gap-12 whitespace-nowrap px-4">
            {[...notices, ...notices].map((n, i) => (
              <Link key={`${n.id}-${i}`} href="/notices" className="text-sm text-gray-700 hover:text-[var(--primary)]">
                {n.is_pinned ? "📌 " : "🔔 "}{n.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-8 md:grid-cols-4">
        <StatCard label={t("students")} value={stats?.students ?? "-"} />
        <StatCard label={t("teachers")} value={stats?.staff ?? "-"} />
        <StatCard label={t("founded")} value={institution?.founded_year ?? "-"} />
        <StatCard label={t("eiin")} value={institution?.eiin ?? "-"} />
      </section>

      {/* Admission Banner */}
      {openCycles.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-8">
          {openCycles.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg p-6 text-white" style={{ background: "var(--primary)" }}>
              <div>
                <p className="text-lg font-semibold">{t("admissionOpen", { className: c.class.name_en })}</p>
                <p className="text-sm opacity-90">{t("seatsCloses", { seats: c.seat_count, date: new Date(c.close_date).toLocaleDateString() })}</p>
              </div>
              <Link href={`/admission/${c.id}`} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900">{t("applyNow")}</Link>
            </div>
          ))}
        </section>
      )}

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-3">
        {/* Notice Board Widget */}
        <section className="md:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">{t("noticeBoard")}</h2>
          <NoticeBoardWidget notices={notices} />
        </section>

        {/* Principal Message */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">{t("principalsMessage")}</h2>
          <div className="rounded-lg border p-4">
            <p className="font-medium">{institution?.principal_name ?? t("principalFallback")}</p>
            <p className="text-sm text-gray-500">{institution?.principal_designation}</p>
            <p className="mt-2 line-clamp-4 text-sm text-gray-700">{institution?.mission_text ?? t("welcomeMessage")}</p>
            <Link href="/about/principal_message" className="mt-2 inline-block text-sm text-blue-600 hover:underline">{t("readMore")}</Link>
          </div>
        </section>
      </div>

      {/* Quick Links */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-3 text-xl font-semibold">{t("quickLinks")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {QUICK_LINKS.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition hover:border-[var(--primary)] hover:shadow-sm"
            >
              <span className="text-2xl">{q.icon}</span>
              <span className="text-xs font-medium text-gray-700">{t(q.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-2">
        {/* Gallery Preview */}
        {!!albums.length && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("photoGallery")}</h2>
              <Link href="/gallery" className="text-sm text-blue-600 hover:underline">{t("viewGallery")}</Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {albums.map((a) => (
                <Link key={a.id} href={`/gallery/${a.id}`} className="group relative block h-28 w-full overflow-hidden rounded-lg bg-gray-100 sm:h-32">
                  {a.cover_url && (
                    <Image src={a.cover_url} alt={a.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition group-hover:scale-105" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-xs text-white">{a.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Events */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t("upcomingEvents")}</h2>
            <Link href="/events" className="text-sm text-blue-600 hover:underline">{t("viewAll")} →</Link>
          </div>
          <div className="divide-y rounded-lg border">
            {!events.length && <p className="p-4 text-sm text-gray-500">{t("noUpcomingEvents")}</p>}
            {events.map((e) => (
              <Link key={e.id} href="/events" className="flex items-center gap-3 p-4 hover:bg-gray-50">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-md border py-1.5" style={{ borderColor: "var(--primary)" }}>
                  <span className="text-xs font-medium uppercase" style={{ color: "var(--primary)" }}>
                    {new Date(e.date_from).toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-none" style={{ color: "var(--primary)" }}>
                    {new Date(e.date_from).getDate()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-gray-500">
                    {e.date_to && e.date_to !== e.date_from
                      ? `${new Date(e.date_from).toLocaleDateString()} – ${new Date(e.date_to).toLocaleDateString()}`
                      : new Date(e.date_from).toLocaleDateString()}
                  </p>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{e.type}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Governing Body / Teachers Preview */}
      {(governingBody.length > 0 || faculty.length > 0) && (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-2">
          {governingBody.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">{t("governingBody")}</h2>
                <Link href="/governing-body" className="text-sm text-blue-600 hover:underline">{t("viewAll")} →</Link>
              </div>
              <div className="flex flex-wrap gap-4">
                {governingBody.map((m) => (
                  <div key={m.id} className="w-20 text-center">
                    <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-gray-100">
                      {m.photo_url && <Image src={m.photo_url} alt={m.name} width={64} height={64} className="h-full w-full object-cover" />}
                    </div>
                    <p className="mt-1 truncate text-xs font-medium">{m.name}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {faculty.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">{t("teachers")}</h2>
                <Link href="/faculty" className="text-sm text-blue-600 hover:underline">{t("viewAll")} →</Link>
              </div>
              <div className="flex flex-wrap gap-4">
                {faculty.map((f) => (
                  <div key={f.id} className="w-20 text-center">
                    <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-gray-100">
                      {f.photo_url && <Image src={f.photo_url} alt={f.name_en} width={64} height={64} className="h-full w-full object-cover" />}
                    </div>
                    <p className="mt-1 truncate text-xs font-medium">{f.name_en}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Contact Section */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-3 text-xl font-semibold">{t("contactUs")}</h2>
        <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 md:grid-cols-2">
          <div>
            <p className="text-sm">{institution?.address}</p>
            <p className="text-sm">{institution?.phone_primary}</p>
            <p className="text-sm">{institution?.email_primary}</p>
          </div>
          {institution?.map_embed_code && <div dangerouslySetInnerHTML={{ __html: institution.map_embed_code }} />}
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <p className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
