import type { Metadata } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/site-chrome";
import { fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

export async function generateMetadata(): Promise<Metadata> {
  const institution = await fetchContent<Institution>("/institution");
  const name = institution?.name_en ?? "Institution Website";
  const description = institution?.established_text ?? institution?.tagline_en ?? `Official website of ${name}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s | ${name}` },
    description,
    openGraph: {
      title: name,
      description,
      images: institution?.logo_url ? [institution.logo_url] : [],
      type: "website",
    },
    twitter: { card: "summary", title: name, description },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const institution = await fetchContent<Institution>("/institution");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: institution?.name_en ?? "Institution",
    url: SITE_URL,
    ...(institution?.address && { address: { "@type": "PostalAddress", streetAddress: institution.address, addressCountry: "BD" } }),
    ...(institution?.phone_primary && { telephone: institution.phone_primary }),
    ...(institution?.logo_url && { logo: institution.logo_url }),
  };

  return (
    <html lang="en">
      <body className="antialiased">
        {/* eslint-disable-next-line react/no-danger */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
