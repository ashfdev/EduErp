"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { cn } from "../lib/utils";

// Sidebar look shared by the admin, teacher and portal apps (light sidebar,
// forest-filled active item). Apps render their own <Link>s with these classes.
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const sideNavStyles = {
  link: (active: boolean) =>
    cn(
      "flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      FOCUS,
      active ? "bg-forest font-semibold text-white" : "text-foreground/80 hover:bg-accent hover:text-foreground",
    ),
  icon: (active: boolean) => cn("h-[18px] w-[18px] shrink-0", active ? "text-lime" : "text-muted-foreground"),
  group: (hasActive: boolean) =>
    cn(
      "flex min-h-[40px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
      FOCUS,
      hasActive ? "text-forest" : "text-foreground/80 hover:bg-accent hover:text-foreground",
    ),
  groupIcon: (hasActive: boolean) => cn("h-[18px] w-[18px] shrink-0", hasActive ? "text-forest" : "text-muted-foreground"),
  children: "mb-1 ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l pl-2",
  count: (active: boolean) =>
    cn("min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none tabular-nums", active ? "bg-lime text-forest" : "bg-ember text-white"),
};

export interface AppShellProps {
  // The drawer closes whenever this changes, i.e. after navigating.
  pathname: string;
  brand: { name: string; logoUrl?: string | null; subtitle?: string };
  sidebar: React.ReactNode;
  sidebarTop?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  headerStart?: React.ReactNode;
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
}

function SidebarBody({ brand, sidebar, sidebarTop, sidebarFooter, onClose }: Omit<AppShellProps, "pathname" | "children" | "headerStart" | "headerEnd"> & { onClose?: () => void }) {
  return (
    <>
      <div className="flex min-h-16 shrink-0 items-center gap-3 border-b px-4 py-3">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-contain" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest font-bold text-lime">{brand.name.charAt(0)}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-forest">{brand.name}</p>
          {brand.subtitle && <p className="text-xs text-muted-foreground">{brand.subtitle}</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close menu" className={cn("-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", FOCUS)}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      {sidebarTop}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">{sidebar}</div>
      {sidebarFooter && <div className="border-t p-3">{sidebarFooter}</div>}
    </>
  );
}

export function AppShell({ pathname, brand, sidebar, sidebarTop, sidebarFooter, headerStart, headerEnd, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const body = { brand, sidebar, sidebarTop, sidebarFooter };
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r bg-background lg:flex">
        <SidebarBody {...body} />
      </aside>

      <div
        className={cn("fixed inset-0 z-40 bg-forest/30 transition-opacity motion-reduce:transition-none lg:hidden", menuOpen ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      {/* invisible (not just off-screen) while closed, so its links aren't reachable by Tab */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-background shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden",
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <SidebarBody {...body} onClose={() => setMenuOpen(false)} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className={cn("-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden", FOCUS)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center">{headerStart}</div>
          {headerEnd && <div className="flex items-center gap-2 sm:gap-3">{headerEnd}</div>}
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
