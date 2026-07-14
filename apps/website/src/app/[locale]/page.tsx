"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import type { Institution, Slider, Notice, GalleryAlbum, EventItem, AdmissionCycleSummary } from "@/lib/types";

export default function HomePage() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [sliders, setSliders] = useState<Slider[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [stats, setStats] = useState<{ students: number; staff: number } | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [openCycles, setOpenCycles] = useState<AdmissionCycleSummary[]>([]);

  useEffect(() => {
    fetchContent<Institution>("/institution").then(setInstitution);
    fetchContent<Slider[]>("/sliders").then((d) => setSliders(d ?? []));
    fetchContent<{ students: number; staff: number }>("/stats").then(setStats);
    fetchContent<Notice[]>("/notices", { limit: "5" }).then((d) => setNotices(d ?? []));
    fetchContent<GalleryAlbum[]>("/gallery/albums", { limit: "1" }).then((d) => setAlbums(d ?? []));
    fetchContent<EventItem[]>("/events", { upcoming: "true", limit: "3" }).then((d) => setEvents(d ?? []));
    fetchContent<AdmissionCycleSummary[]>("/admission/open").then((d) => setOpenCycles(d ?? []));
  }, []);

  useEffect(() => {
    if (sliders.length < 2) return;
    const interval = setInterval(() => setSlideIndex((i) => (i + 1) % sliders.length), 5000);
    return () => clearInterval(interval);
  }, [sliders.length]);

  const latestAlbum = albums[0];

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
          <div className="divide-y rounded-lg border">
            {!notices.length && <p className="p-4 text-sm text-gray-500">{t("noNotices")}</p>}
            {notices.map((n) => (
              <div key={n.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{n.is_pinned ? "📌 " : ""}{n.title}</p>
                  <p className="text-xs text-gray-500">{n.publish_at ? new Date(n.publish_at).toLocaleDateString() : ""}</p>
                </div>
                {n.attachment_url && <a href={n.attachment_url} className="text-sm text-blue-600 hover:underline">{tCommon("download")}</a>}
              </div>
            ))}
          </div>
          <Link href="/notices" className="mt-2 inline-block text-sm text-blue-600 hover:underline">{t("seeAllNotices")}</Link>
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

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-2">
        {/* Gallery Preview */}
        {latestAlbum && (
          <section>
            <h2 className="mb-3 text-xl font-semibold">{t("photoGallery")}</h2>
            <Link href={`/gallery/${latestAlbum.id}`} className="relative block h-48 w-full overflow-hidden rounded-lg">
              {latestAlbum.cover_url && (
                <Image src={latestAlbum.cover_url} alt={latestAlbum.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
              )}
            </Link>
            <Link href="/gallery" className="mt-2 inline-block text-sm text-blue-600 hover:underline">{t("viewGallery")}</Link>
          </section>
        )}

        {/* Upcoming Events */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">{t("upcomingEvents")}</h2>
          <div className="divide-y rounded-lg border">
            {!events.length && <p className="p-4 text-sm text-gray-500">{t("noUpcomingEvents")}</p>}
            {events.map((e) => (
              <div key={e.id} className="p-4">
                <p className="font-medium">{e.name}</p>
                <p className="text-xs text-gray-500">{new Date(e.date_from).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

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
