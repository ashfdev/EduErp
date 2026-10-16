"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { AppShell, NotificationBell, cn } from "@education-erp/ui";
import { ProtectedRoute } from "./protected-route";
import { PortalNav } from "./portal-nav";
import { LanguageToggle } from "./language-toggle";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { useNotifications } from "@/hooks/use-notifications";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, students, activeStudentId, setActiveStudent, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const tCommon = useTranslations("common");
  const activeStudent = students.find((s) => s.id === activeStudentId) ?? students[0];

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
        sidebar={<PortalNav />}
        sidebarTop={
          students.length > 1 && (
            <div className="border-b px-3 py-3">
              <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{tCommon("switchStudent")}</p>
              <div className="flex flex-col gap-1">
                {students.map((s) => {
                  const active = s.id === activeStudent?.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveStudent(s.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-forest bg-forest/5 font-semibold text-forest" : "border-transparent text-foreground/80 hover:bg-accent",
                      )}
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", active ? "bg-lime ring-2 ring-forest/20" : "bg-border")} />
                      <span className="truncate">{s.name_en}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        }
        sidebarFooter={
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-lime">
              {(activeStudent?.name_en ?? user?.name_en)?.charAt(0) ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{activeStudent?.name_en ?? user?.name_en}</p>
              <p className="truncate text-xs text-muted-foreground">{activeStudent?.student_uid ?? user?.phone}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title={tCommon("logout")}
              aria-label={tCommon("logout")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        }
        headerStart={
          activeStudent && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-forest">{activeStudent.name_en}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[activeStudent.current_class?.name_en, activeStudent.current_section?.name].filter(Boolean).join(", ")}
              </p>
            </div>
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
