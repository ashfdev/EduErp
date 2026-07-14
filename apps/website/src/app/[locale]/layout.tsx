import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { SiteChrome } from "@/components/site-chrome";
import { routing } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-noto-bengali", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

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
    <html lang={locale} className={`${inter.variable} ${notoBengali.variable}`}>
      <body className="font-sans antialiased">
        {/* eslint-disable-next-line react/no-danger */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SiteChrome>{children}</SiteChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
