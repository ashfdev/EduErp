import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Education ERP — Institution Website",
  description: "Public institution website",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
