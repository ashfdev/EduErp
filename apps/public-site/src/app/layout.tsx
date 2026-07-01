import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getContent, type TenantInfo } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Institution Public Website',
  description: 'Public website — reads from the ERP Content API via on-demand ISR',
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/notices', label: 'Notices' },
  { href: '/pages/about-us', label: 'About' },
  { href: '/faculty', label: 'Faculty' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/downloads', label: 'Downloads' },
  { href: '/result', label: 'Result' },
  { href: '/verify', label: 'Verify Certificate' },
  { href: '/contact', label: 'Contact' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getContent<TenantInfo>('/tenant', 300);

  return (
    <html lang="bn">
      <body className="min-h-screen bg-white text-gray-900">
        <header className="border-b bg-blue-700 text-white">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <div className="text-lg font-semibold">{tenant?.nameEn ?? 'Institution'}</div>
            {tenant?.nameBn && <div className="text-sm opacity-90">{tenant.nameBn}</div>}
          </div>
          <nav className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 pb-3 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>

        <footer className="mt-12 border-t bg-gray-50 py-6 text-center text-xs text-gray-500">
          {tenant?.address && <p>{tenant.address}</p>}
          {tenant?.eiin && <p>EIIN: {tenant.eiin}</p>}
        </footer>
      </body>
    </html>
  );
}
