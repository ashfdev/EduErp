"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { fetchContent } from "@/lib/content-api";
import type { GalleryAlbum } from "@/lib/types";

export default function GalleryIndexPage() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);

  useEffect(() => {
    fetchContent<GalleryAlbum[]>("/gallery/albums", { limit: "24" }).then((d) => setAlbums(d ?? []));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Gallery</h1>
      {!albums.length && <p className="text-sm text-gray-500">No albums published yet.</p>}
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
