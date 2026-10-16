"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { sideNavStyles } from "@education-erp/ui";
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

// Rendered inside the shared AppShell, both as the desktop sidebar and the phone drawer.
export function PortalNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  // Per group, so opening one doesn't open the other.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        if (isGroup(item)) {
          const hasActive = item.children.some((c) => pathname === c.href);
          const open = expanded[item.key] ?? hasActive;
          return (
            <div key={item.key}>
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [item.key]: !open }))}
                aria-expanded={open}
                className={sideNavStyles.group(hasActive)}
              >
                <span className="flex items-center gap-3">
                  <Icon className={sideNavStyles.groupIcon(hasActive)} />
                  {t(item.key)}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className={sideNavStyles.children}>
                  {item.children.map((c) => {
                    const isActive = pathname === c.href;
                    return (
                      <Link key={c.href} href={c.href} aria-current={isActive ? "page" : undefined} className={sideNavStyles.link(isActive)}>
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
        return (
          <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} className={sideNavStyles.link(isActive)}>
            <Icon className={sideNavStyles.icon(isActive)} />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
