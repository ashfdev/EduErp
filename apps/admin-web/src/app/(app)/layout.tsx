'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/students', label: 'Students' },
  { href: '/staff', label: 'Staff' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/exams', label: 'Exams & Results' },
  { href: '/website', label: 'Website' },
  { href: '/fees', label: 'Fees & Finance' },
  { href: '/payroll', label: 'Payroll' },
  { href: '/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, logout } = useAuthStore();

  useEffect(() => {
    if (!accessToken) router.replace('/login');
  }, [accessToken, router]);

  if (!accessToken) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-gray-50 p-4">
        <div className="mb-6 text-sm font-semibold text-gray-500">Education ERP</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname?.startsWith(item.href) ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 border-t pt-4 text-xs text-gray-500">
          <div>{user?.name}</div>
          <div>{user?.role}</div>
          <button onClick={logout} className="mt-2 text-red-600 hover:underline">
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
