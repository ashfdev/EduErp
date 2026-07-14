"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const ITEMS = [
  { href: "/", icon: "🏠", key: "home" },
  { href: "/results", icon: "📋", key: "results" },
  { href: "/attendance", icon: "📅", key: "attendance" },
  { href: "/fees", icon: "💳", key: "fees" },
  { href: "/notices", icon: "🔔", key: "notices" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

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
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
