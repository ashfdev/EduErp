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
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              active ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
