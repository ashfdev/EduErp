"use client";

import { useRouter } from "next/navigation";
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
import { LogOut } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, refreshToken, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const tCommon = useTranslations("common");

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
        {/* Sidebar */}
        <aside className="flex w-64 flex-col bg-[#0B1437] text-white shadow-xl">
          <div className="flex min-h-[4rem] shrink-0 items-center gap-3 border-b border-white/10 px-6 py-3 font-bold tracking-tight">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-8 w-8 shrink-0 rounded object-contain" /> : <div className="h-8 w-8 shrink-0 rounded bg-primary flex items-center justify-center text-white">E</div>}
            <span className="text-base leading-tight">{institutionName ?? tCommon("appName")}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <SidebarNav />
          </div>

          {/* User Profile Widget */}
          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary-foreground font-semibold">
                {user?.name_en?.[0] || "U"}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-white">{user?.name_en || "User"}</p>
                <p className="truncate text-xs text-slate-400">{user?.role?.replace(/_/g, " ")}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors" title={tCommon("signOut")}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-4 flex-1">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAllRead={markAllRead}
                onNotificationClick={(n) => {
                  markRead(n.id);
                  if (n.link) router.push(n.link);
                }}
              />
              <div className="h-6 w-px bg-border"></div>
              <LanguageToggle />
            </div>
          </header>
          
          <main className="flex-1 overflow-y-auto bg-background/50 p-6">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
