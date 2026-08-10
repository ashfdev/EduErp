// Pin the Next.js server process's timezone explicitly (2026-08-10 audit
// finding) — SSR for "use client" pages still runs Date calculations
// server-side on first render; without this, a deployment whose host
// defaults to UTC (the common case) can render a different "today"/day-of-
// week than the browser then hydrates with. Single-institution BD app —
// matches the same fix applied to every backend service's entrypoint.
process.env.TZ = "Asia/Dhaka";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@education-erp/ui", "@education-erp/types", "@education-erp/validators"],
  output: "standalone",
};

export default nextConfig;
