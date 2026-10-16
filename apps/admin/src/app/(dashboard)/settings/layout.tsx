"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@education-erp/ui";
import { SETTINGS_GROUPS } from "@/lib/settings-nav";

const ALL_ITEMS = SETTINGS_GROUPS.flatMap((g) => g.items);

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Longest matching href wins, so /settings/x/y still highlights /settings/x.
  const active = ALL_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="lg:hidden">
        <Select value={active?.href} onValueChange={(href) => router.push(href)}>
          <SelectTrigger className="h-11 w-full" aria-label="Settings section">
            <SelectValue placeholder="Choose a settings section" />
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            {SETTINGS_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.href} value={item.href}>{item.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <aside className="sticky top-[88px] hidden max-h-[calc(100vh-112px)] w-60 shrink-0 overflow-y-auto rounded-lg border p-3 lg:block">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="mb-1 px-2 text-[13px] font-semibold text-muted-foreground">{group.label}</p>
            <nav className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = item.href === active?.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? "bg-lime font-semibold text-forest" : "hover:bg-accent"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
