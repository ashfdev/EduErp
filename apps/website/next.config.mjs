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
    ],
  },
};

export default withNextIntl(nextConfig);
