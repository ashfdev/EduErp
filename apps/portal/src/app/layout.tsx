import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-noto-bengali", display: "swap" });

export const metadata: Metadata = {
  title: "Education ERP — Portal",
  description: "Student & guardian portal",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1a3c4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${notoBengali.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
