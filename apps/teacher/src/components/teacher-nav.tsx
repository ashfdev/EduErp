"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/attendance", label: "Attendance" },
  { href: "/marks", label: "Marks" },
  { href: "/leave", label: "Leave" },
  { href: "/profile", label: "Profile" },
];

export function TeacherNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <nav className="flex gap-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium ${pathname === item.href ? "text-[var(--primary,#1a3c4a)]" : "text-gray-500"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.name_en}</span>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
