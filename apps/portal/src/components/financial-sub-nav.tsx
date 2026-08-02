"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

// Rendered atop /fees, /fees/payment-ledger, /fees/waivers so the three
// Financial Service sub-pages stay reachable from within each other on
// mobile too, not just via the desktop sidebar's expandable group.
const TABS = [
  { href: "/fees", key: "fees" },
  { href: "/fees/payment-ledger", key: "paymentLedger" },
  { href: "/fees/waivers", key: "scholarshipWaiver" },
] as const;

export function FinancialSubNav() {
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
