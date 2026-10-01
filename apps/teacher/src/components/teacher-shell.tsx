"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, Menu } from "lucide-react";
import { ProtectedRoute } from "./protected-route";
import { TeacherNav } from "./teacher-nav";
import { useInstitution } from "@/hooks/use-institution";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationBell } from "@education-erp/ui";

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { institutionName } = useInstitution();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Side nav on every screen size (product decision 2026-09-23, replacing
  // the old bottom tab bar) — a persistent <aside> from lg: up, and an
  // off-canvas drawer below that, opened via the mobile header's hamburger
  // button. Auto-close on navigation so it never lingers open over the new
  // page, and lock body scroll while open so the page behind can't scroll
  // underneath the backdrop.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    if (!isMenuOpen) return () => { document.body.style.overflow = ""; };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  function handleNotificationClick(n: { id: string; link?: string | null }) {
    markRead(n.id);
    if (n.link) router.push(n.link);
  }

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-slate-50/50">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 border-r border-slate-800 bg-slate-900 shrink-0 h-screen sticky top-0">
          <div className="flex items-center justify-end px-4 pt-3">
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
              onNotificationClick={handleNotificationClick}
              className="text-slate-300"
            />
          </div>
          <TeacherNav />
        </aside>

        {/* Mobile off-canvas drawer + backdrop */}
        <div
          className={`lg:hidden fixed inset-0 z-50 bg-black/50 transition-opacity ${
            isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setIsMenuOpen(false)}
          aria-hidden={!isMenuOpen}
        />
        {/* invisible (not just translated off-screen) while closed, so the
            hidden drawer's links aren't reachable by Tab or a screen reader;
            visibility stays "visible" for the whole slide-out transition. */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`lg:hidden fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 shadow-2xl transition-[transform,visibility] duration-200 ${
            isMenuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
          }`}
        >
          <TeacherNav onClose={() => setIsMenuOpen(false)} />
        </aside>

        <main className="flex-1 w-full min-w-0 relative pt-14 lg:pt-0">
          {/* Mobile Top Header — 40px tap targets (was 32px) */}
          <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center justify-between gap-2 px-2 shadow-sm">
            <div className="flex min-w-0 items-center gap-1">
              <button
                onClick={() => setIsMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={isMenuOpen}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              >
                <Menu className="h-5 w-5" />
              </button>
              {pathname !== "/" ? (
                <button
                  onClick={() => router.back()}
                  className="flex h-10 items-center rounded-lg pl-1 pr-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  Back
                </button>
              ) : (
                <span className="truncate pl-1 font-bold text-slate-800">{institutionName ?? "Teacher Portal"}</span>
              )}
            </div>
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
              onNotificationClick={handleNotificationClick}
            />
          </header>

          <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
