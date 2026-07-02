"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchContent } from "@/lib/content-api";
import type { StaticPageContent } from "@/lib/types";

const PAGES = [
  { key: "about", label: "About Us" },
  { key: "history", label: "History" },
  { key: "mission_vision", label: "Mission & Vision" },
  { key: "principal_message", label: "Principal's Message" },
  { key: "vice_principal_message", label: "Vice Principal's Message" },
  { key: "chairman_message", label: "Chairman's Message" },
  { key: "facilities", label: "Facilities" },
  { key: "achievements", label: "Achievements" },
  { key: "admission_info", label: "Admission Info" },
];

export default function AboutSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<StaticPageContent | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setNotFound(false);
    fetchContent<StaticPageContent>(`/pages/${slug}`).then((d) => {
      if (!d) setNotFound(true);
      setPage(d);
    });
  }, [slug]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        <aside className="space-y-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.key} href={`/about/${p.key}`} className={`block rounded-md px-3 py-2 hover:bg-gray-50 ${p.key === slug ? "bg-gray-100 font-medium" : ""}`}>
              {p.label}
            </Link>
          ))}
        </aside>
        <div className="md:col-span-3">
          {notFound && <p className="text-sm text-gray-500">This page has not been configured yet.</p>}
          {page && (
            <>
              <h1 className="mb-4 text-2xl font-semibold">{page.title_en ?? PAGES.find((p) => p.key === slug)?.label}</h1>
              <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: page.content_en ?? "" }} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
