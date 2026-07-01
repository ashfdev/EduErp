import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Education ERP — Portal',
  description: 'Student & Guardian portal',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
