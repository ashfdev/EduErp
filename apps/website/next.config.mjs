// Pin the Next.js server process's timezone explicitly (2026-08-10 audit
// finding) — see apps/admin/next.config.mjs's identical comment for why.
process.env.TZ = "Asia/Dhaka";

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@education-erp/ui", "@education-erp/types"],
  output: "standalone",
  images: {
    remotePatterns: [
      // Azure Blob Storage (production) — account name is institution-specific
      { protocol: "https", hostname: "*.blob.core.windows.net" },
      // Local-disk upload fallback (dev/no-Azure-configured)
      { protocol: "http", hostname: "localhost", port: "4000" },
      // Deterministic placeholder photos used by packages/db/prisma/seed.ts
      // demo content (sliders, staff/faculty photos, gallery, governing
      // body) — real institutions never point live content at this host.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
