"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

// Rendered atop /fees/waivers, /facilities/transport, /facilities/hostel so
// the three Facilities sub-pages stay reachable from within each other on
// mobile too, not just via the desktop sidebar's expandable group. Mirrors
// FinancialSubNav's exact pattern.
const TABS = [
  { href: "/fees/waivers", key: "scholarshipWaiver" },
  { href: "/facilities/transport", key: "facilitiesTransport" },
  { href: "/facilities/hostel", key: "facilitiesHostel" },
] as const;

export function FacilitiesSubNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex gap-6 overflow-x-auto border-b no-scrollbar">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border-b-2 px-1 text-sm transition-colors ${
              active ? "border-forest font-semibold text-forest" : "border-transparent font-medium text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
