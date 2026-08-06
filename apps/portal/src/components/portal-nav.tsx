"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, CalendarDays, CalendarClock, CreditCard, Bell, ChevronDown, Building2, type LucideIcon } from "lucide-react";

type NavLeaf = { href: string; icon: LucideIcon; key: string };
type NavGroup = { key: string; icon: LucideIcon; children: { href: string; key: string }[] };
type NavEntry = NavLeaf | NavGroup;

function isGroup(item: NavEntry): item is NavGroup {
  return "children" in item;
}

// "Fees" alone became "Financial Service" once Payment Ledger needed a
// home too — a flat list, no grouping support at all, was the whole reason
// it was only ever a backend route with nowhere in the nav to reach it
// from. Scholarship & Waiver moved out into "Facilities" below (Plan
// Twenty-Five, Phase F) alongside the new Transport/Hostel self-service
// flows — all three are "apply for an entitlement, staff reviews" in
// shape, which Fees/Payment Ledger aren't.
const ITEMS: NavEntry[] = [
  { href: "/", icon: Home, key: "home" },
  { href: "/routine", icon: CalendarClock, key: "routine" },
  { href: "/results", icon: ClipboardList, key: "results" },
  { href: "/attendance", icon: CalendarDays, key: "attendance" },
  {
    key: "financialService",
    icon: CreditCard,
    children: [
      { href: "/fees", key: "fees" },
      { href: "/fees/payment-ledger", key: "paymentLedger" },
    ],
  },
  {
    key: "facilities",
    icon: Building2,
    children: [
      { href: "/fees/waivers", key: "scholarshipWaiver" },
      { href: "/facilities/transport", key: "facilitiesTransport" },
      { href: "/facilities/hostel", key: "facilitiesHostel" },
    ],
  },
  { href: "/notices", icon: Bell, key: "notices" },
];

export function PortalNav({ isMobile }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [manualExpand, setManualExpand] = useState(false);

  if (!isMobile) {
    return (
      <nav className="flex-1 space-y-1 mt-6 px-3">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Main Menu</p>
        {ITEMS.map((item) => {
          if (isGroup(item)) {
            const isChildActive = item.children.some((c) => pathname === c.href);
            const expanded = manualExpand || isChildActive;
            const Icon = item.icon;
            return (
              <div key={item.key}>
                <button
                  type="button"
                  onClick={() => setManualExpand((v) => !v)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isChildActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isChildActive ? "text-primary" : "text-slate-500"}`} />
                  <span className="flex-1 text-left">{t(item.key)}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-slate-800 pl-3">
                    {item.children.map((c) => {
                      const isActive = pathname === c.href;
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                            isActive ? "bg-primary text-white shadow-md shadow-primary/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                          }`}
                        >
                          {t(c.key)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

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
        const href = isGroup(item) ? item.children[0]!.href : item.href;
        const active = isGroup(item) ? item.children.some((c) => pathname === c.href) : pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={isGroup(item) ? item.key : item.href}
            href={href}
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
