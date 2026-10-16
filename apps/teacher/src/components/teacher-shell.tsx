"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, LogOut } from "lucide-react";
import { AppShell, NotificationBell } from "@education-erp/ui";
import { ProtectedRoute } from "./protected-route";
import { TeacherNav } from "./teacher-nav";
import { LanguageToggle } from "./language-toggle";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { useNotifications } from "@/hooks/use-notifications";

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const tCommon = useTranslations("common");

  function handleNotificationClick(n: { id: string; link?: string | null }) {
    markRead(n.id);
    if (n.link) router.push(n.link);
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <ProtectedRoute>
      <AppShell
        pathname={pathname}
        brand={{ name: institutionName ?? "Education ERP", logoUrl, subtitle: tCommon("portalName") }}
        sidebar={<TeacherNav />}
        sidebarFooter={
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-lime">{user?.name_en?.charAt(0) ?? "U"}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name_en}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{user?.role?.replace(/_/g, " ").toLowerCase()}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title={tCommon("logOut")}
              aria-label={tCommon("logOut")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        }
        headerStart={
          pathname !== "/" && (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 items-center rounded-md pl-1 pr-3 text-sm font-semibold text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="mr-1 h-5 w-5" />
              {tCommon("back")}
            </button>
          )
        }
        headerEnd={
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-md border">
              <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkAllRead={markAllRead} onNotificationClick={handleNotificationClick} />
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
