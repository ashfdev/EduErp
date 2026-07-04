/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@education-erp/ui", "@education-erp/types", "@education-erp/validators"],
  output: "standalone",
};

export default nextConfig;
