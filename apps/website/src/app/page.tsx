"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchContent } from "@/lib/content-api";
import type { Institution, Slider, Notice, GalleryAlbum, EventItem, AdmissionCycleSummary } from "@/lib/types";

export default function HomePage() {
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image_url} alt={s.title ?? ""} className="h-full w-full object-cover" />
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
          <p className="text-gray-500">{institution?.name_en ?? "Welcome"}</p>
        </section>
      )}

      {/* Quick Stats */}
      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-8 md:grid-cols-4">
        <StatCard label="Students" value={stats?.students ?? "-"} />
        <StatCard label="Teachers" value={stats?.staff ?? "-"} />
        <StatCard label="Founded" value={institution?.founded_year ?? "-"} />
        <StatCard label="EIIN" value={institution?.eiin ?? "-"} />
      </section>

      {/* Admission Banner */}
      {openCycles.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-8">
          {openCycles.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg p-6 text-white" style={{ background: "var(--primary)" }}>
              <div>
                <p className="text-lg font-semibold">Admission Open — {c.class.name_en}</p>
                <p className="text-sm opacity-90">{c.seat_count} seats · Closes {new Date(c.close_date).toLocaleDateString()}</p>
              </div>
              <Link href={`/admission/${c.id}`} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900">Apply Now</Link>
            </div>
          ))}
        </section>
      )}

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-3">
        {/* Notice Board Widget */}
        <section className="md:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">Notice Board</h2>
          <div className="divide-y rounded-lg border">
            {!notices.length && <p className="p-4 text-sm text-gray-500">No notices yet.</p>}
            {notices.map((n) => (
              <div key={n.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{n.is_pinned ? "📌 " : ""}{n.title}</p>
                  <p className="text-xs text-gray-500">{n.publish_at ? new Date(n.publish_at).toLocaleDateString() : ""}</p>
                </div>
                {n.attachment_url && <a href={n.attachment_url} className="text-sm text-blue-600 hover:underline">Download</a>}
              </div>
            ))}
          </div>
          <Link href="/notices" className="mt-2 inline-block text-sm text-blue-600 hover:underline">See All Notices →</Link>
        </section>

        {/* Principal Message */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">Principal&apos;s Message</h2>
          <div className="rounded-lg border p-4">
            <p className="font-medium">{institution?.principal_name ?? "Principal"}</p>
            <p className="text-sm text-gray-500">{institution?.principal_designation}</p>
            <p className="mt-2 line-clamp-4 text-sm text-gray-700">{institution?.mission_text ?? "Welcome to our institution."}</p>
            <Link href="/about/principal_message" className="mt-2 inline-block text-sm text-blue-600 hover:underline">Read More →</Link>
          </div>
        </section>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-2">
        {/* Gallery Preview */}
        {latestAlbum && (
          <section>
            <h2 className="mb-3 text-xl font-semibold">Photo Gallery</h2>
            <Link href={`/gallery/${latestAlbum.id}`}>
              {latestAlbum.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={latestAlbum.cover_url} alt={latestAlbum.name} className="h-48 w-full rounded-lg object-cover" />
              )}
            </Link>
            <Link href="/gallery" className="mt-2 inline-block text-sm text-blue-600 hover:underline">View Gallery →</Link>
          </section>
        )}

        {/* Upcoming Events */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">Upcoming Events</h2>
          <div className="divide-y rounded-lg border">
            {!events.length && <p className="p-4 text-sm text-gray-500">No upcoming events.</p>}
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
        <h2 className="mb-3 text-xl font-semibold">Contact Us</h2>
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
