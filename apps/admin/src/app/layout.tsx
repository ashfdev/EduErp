import type { Metadata } from "next";
import { Hind_Siliguri } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Only 500+ weights are loaded, so font-normal (400) renders at 500 instead of looking thin.
const hind = Hind_Siliguri({ subsets: ["bengali", "latin"], weight: ["500", "600", "700"], variable: "--font-hind", display: "swap" });
// Noto Sans for digits only. No fallback face: an Arial fallback would cover every character, not just 0-9.
const digits = localFont({
  src: "../fonts/noto-sans-digits.woff2",
  weight: "500 700",
  variable: "--font-digits",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0030-0039" }],
});

export const metadata: Metadata = {
  title: "Education ERP — Admin",
  description: "Institution administration panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${digits.variable} ${hind.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
