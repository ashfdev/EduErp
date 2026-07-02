"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", icon: "🏠", label: "Home" },
  { href: "/results", icon: "📋", label: "Results" },
  { href: "/attendance", icon: "📅", label: "Attendance" },
  { href: "/fees", icon: "💳", label: "Fees" },
  { href: "/notices", icon: "🔔", label: "Notices" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-white">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-[var(--primary)] font-medium" : "text-gray-500"}`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
