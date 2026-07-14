"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { fetchContent } from "@/lib/content-api";
import type { GalleryAlbum, GalleryImage } from "@/lib/types";

export default function GalleryAlbumPage() {
  const { album_id } = useParams<{ album_id: string }>();
  const t = useTranslations("gallery");
  const [data, setData] = useState<{ album: GalleryAlbum; images: GalleryImage[] } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    fetchContent<{ album: GalleryAlbum; images: GalleryImage[] }>(`/gallery/albums/${album_id}/images`).then(setData);
  }, [album_id]);

  if (!data) return <main className="mx-auto max-w-6xl px-4 py-10"><p className="text-sm text-gray-500">{t("loading")}</p></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{data.album.name}</h1>
      {data.album.description && <p className="mt-1 text-gray-600">{data.album.description}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.images.map((img) => (
          <button key={img.id} onClick={() => setLightbox(img.image_url)} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
            <Image src={img.image_url} alt={img.caption ?? ""} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover transition hover:scale-105" />
          </button>
        ))}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setLightbox(null)}>
          <div className="relative h-[90vh] w-[90vw]">
            <Image src={lightbox} alt="" fill sizes="90vw" className="rounded-lg object-contain" />
          </div>
        </div>
      )}
    </main>
  );
}
