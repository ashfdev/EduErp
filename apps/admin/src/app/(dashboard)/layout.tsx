"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { AppShell, NotificationBell } from "@education-erp/ui";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";
import { useNotifications } from "@/hooks/use-notifications";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { GlobalSearch } from "@/components/layout/global-search";
import { LogOut } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
      <AppShell
        pathname={pathname}
        brand={{ name: institutionName ?? tCommon("appName"), logoUrl }}
        sidebar={<SidebarNav />}
        sidebarFooter={
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-lime">{user?.name_en?.[0] || "U"}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name_en || "User"}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{user?.role?.replace(/_/g, " ").toLowerCase()}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title={tCommon("signOut")}
              aria-label={tCommon("signOut")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        }
        headerStart={<GlobalSearch />}
        headerEnd={
          <>
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
          </>
        }
      >
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
