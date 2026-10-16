"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { NotificationBell } from "@education-erp/ui";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";
import { useNotifications } from "@/hooks/use-notifications";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { GlobalSearch } from "@/components/layout/global-search";
import { LogOut, Menu, X } from "lucide-react";

function SidebarContent({ onClose, onLogout }: { onClose?: () => void; onLogout: () => void }) {
  const { user } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const tCommon = useTranslations("common");

  return (
    <>
      <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5 py-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md bg-white object-contain p-0.5" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-lime font-bold text-forest">E</div>
        )}
        <span className="flex-1 text-[15px] font-semibold leading-tight text-white">{institutionName ?? tCommon("appName")}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav />
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-bold text-forest">
            {user?.name_en?.[0] || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name_en || "User"}</p>
            <p className="truncate text-xs capitalize text-white/55">{user?.role?.replace(/_/g, " ").toLowerCase()}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title={tCommon("signOut")}
            aria-label={tCommon("signOut")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { refreshToken, logout } = useAuthStore();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);

  // Below lg the sidebar is an off-canvas drawer: close it on navigation and
  // lock page scroll behind it while open.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
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

  async function handleLogout() {
    try {
      if (refreshToken) await api.post("/api/auth/logout", { refresh_token: refreshToken });
    } finally {
      logout();
      router.replace("/login");
    }
  }

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col bg-forest lg:flex">
          <SidebarContent onLogout={handleLogout} />
        </aside>

        <div
          className={`fixed inset-0 z-40 bg-forest/40 transition-opacity motion-reduce:transition-none lg:hidden ${menuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
        {/* invisible (not just off-screen) while closed, so its links aren't reachable by Tab */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-forest shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden ${
            menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
          }`}
        >
          <SidebarContent onClose={() => setMenuOpen(false)} onLogout={handleLogout} />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 items-center">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border">
                <NotificationBell
                  notifications={notifications}
                  unreadCount={unreadCount}
                  onMarkAllRead={markAllRead}
                  onNotificationClick={(n) => {
                    markRead(n.id);
                    if (n.link) router.push(n.link);
                  }}
                />
              </div>
              <LanguageToggle />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
