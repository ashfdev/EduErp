import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
