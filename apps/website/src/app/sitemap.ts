import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

// Static routes only for now — Notice/GalleryAlbum/Download have no slug
// field yet (a separate, larger follow-up: add slug columns + backfill +
// dedicated detail pages), so there's nothing dynamic to enumerate here.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "", priority: 1.0, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/faculty", priority: 0.6, changeFrequency: "monthly" },
    { path: "/gallery", priority: 0.6, changeFrequency: "weekly" },
    { path: "/downloads", priority: 0.6, changeFrequency: "monthly" },
    { path: "/notices", priority: 0.8, changeFrequency: "daily" },
    { path: "/events", priority: 0.6, changeFrequency: "weekly" },
    { path: "/governing-body", priority: 0.5, changeFrequency: "monthly" },
    { path: "/admission", priority: 0.7, changeFrequency: "weekly" },
    { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  ];

  return staticPages.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
