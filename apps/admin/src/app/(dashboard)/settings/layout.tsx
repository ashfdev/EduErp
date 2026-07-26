import Link from "next/link";
import { SETTINGS_GROUPS } from "@/lib/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <aside className="w-60 shrink-0 border-r p-4">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
            <nav className="flex flex-col gap-1">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
