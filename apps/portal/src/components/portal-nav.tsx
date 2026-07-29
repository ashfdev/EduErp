"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, CalendarDays, CalendarClock, CreditCard, Bell } from "lucide-react";

const ITEMS = [
  { href: "/", icon: Home, key: "home" },
  { href: "/routine", icon: CalendarClock, key: "routine" },
  { href: "/results", icon: ClipboardList, key: "results" },
  { href: "/attendance", icon: CalendarDays, key: "attendance" },
  { href: "/fees", icon: CreditCard, key: "fees" },
  { href: "/notices", icon: Bell, key: "notices" },
] as const;

export function PortalNav({ isMobile }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  if (!isMobile) {
    return (
      <nav className="flex-1 space-y-1 mt-6 px-3">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Main Menu</p>
        {ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-500"}`} />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex w-full items-center justify-between px-2 py-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] transition-all ${
              active ? "text-white font-bold bg-slate-800" : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} strokeWidth={active ? 2.5 : 2} />
            {t(item.key)}
          </Link>
        );
      })}
    </div>
  );
}
