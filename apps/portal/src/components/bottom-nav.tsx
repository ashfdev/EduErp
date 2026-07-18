"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, CalendarDays, CreditCard, Bell } from "lucide-react";

const ITEMS = [
  { href: "/", icon: Home, key: "home" },
  { href: "/results", icon: ClipboardList, key: "results" },
  { href: "/attendance", icon: CalendarDays, key: "attendance" },
  { href: "/fees", icon: CreditCard, key: "fees" },
  { href: "/notices", icon: Bell, key: "notices" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex w-full bg-white border-t pb-safe">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10px] transition-colors ${
              active ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? "fill-primary/10" : ""}`} strokeWidth={active ? 2.5 : 2} />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
