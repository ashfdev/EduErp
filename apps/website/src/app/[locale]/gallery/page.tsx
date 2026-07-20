"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import Image from "next/image";
import { useContent } from "@/hooks/use-content";
import type { GalleryAlbum } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

export default function GalleryIndexPage() {
  const t = useTranslations("gallery");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<GalleryAlbum[]>("/gallery/albums", { limit: "24" });
  const albums = data ?? [];

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      {!albums.length && <p className="text-sm text-gray-500">{t("noAlbums")}</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {albums.map((a) => (
          <Link key={a.id} href={`/gallery/${a.id}`} className="group">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              {a.cover_url && (
                <Image src={a.cover_url} alt={a.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition group-hover:scale-105" />
              )}
            </div>
            <p className="mt-2 text-sm font-medium">{a.name}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
