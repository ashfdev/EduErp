import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Education ERP — Admin',
  description: 'Institution admin dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
