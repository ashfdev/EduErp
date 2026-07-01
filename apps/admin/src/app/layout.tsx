import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Education ERP — Admin",
  description: "Institution administration panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
