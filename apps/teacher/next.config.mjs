// Pin the Next.js server process's timezone explicitly (2026-08-10 audit
// finding) — see apps/admin/next.config.mjs's identical comment for why.
process.env.TZ = "Asia/Dhaka";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@education-erp/ui", "@education-erp/types"],
  output: "standalone",
};

export default nextConfig;
