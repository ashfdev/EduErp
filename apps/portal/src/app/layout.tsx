import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Education ERP — Portal",
  description: "Student & guardian portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
