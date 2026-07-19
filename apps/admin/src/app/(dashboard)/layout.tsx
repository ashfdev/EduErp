"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Button, NotificationBell } from "@education-erp/ui";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";
import { useNotifications } from "@/hooks/use-notifications";
import {
  LayoutDashboard, Users, GraduationCap, AlertCircle, FileText,
  ClipboardCheck, FileSpreadsheet, Edit3, Award, BookOpen,
  Wallet, Calculator, Package, UserPlus, Printer, Globe,
  Briefcase, Library, Bus, Home, BarChart3, MessageSquare,
  Settings, LogOut, Search
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/students", key: "students", icon: Users },
  { href: "/alumni", key: "alumni", icon: GraduationCap },
  { href: "/complaints", key: "complaints", icon: AlertCircle },
  { href: "/document-requests", key: "documentRequests", icon: FileText },
  { href: "/attendance/mark", key: "attendance", icon: ClipboardCheck },
  { href: "/examination", key: "examination", icon: FileSpreadsheet },
  { href: "/marks", key: "marks", icon: Edit3 },
  { href: "/results", key: "results", icon: Award },
  { href: "/course-enrollment", key: "courseEnrollment", icon: BookOpen },
  { href: "/fees", key: "fees", icon: Wallet },
  { href: "/accounts", key: "accounts", icon: Calculator },
  { href: "/inventory", key: "inventory", icon: Package },
  { href: "/admission", key: "admission", icon: UserPlus },
  { href: "/documents/print", key: "documents", icon: Printer },
  { href: "/website", key: "website", icon: Globe },
  { href: "/hr", key: "hr", icon: Briefcase },
  { href: "/library", key: "library", icon: Library },
  { href: "/transport", key: "transport", icon: Bus },
  { href: "/hostel", key: "hostel", icon: Home },
  { href: "/reports", key: "reports", icon: BarChart3 },
  { href: "/notifications/bulk-sms", key: "bulkSms", icon: MessageSquare },
  { href: "/settings/institution", key: "settings", icon: Settings },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, refreshToken, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const [headerSearch, setHeaderSearch] = useState("");

  function handleHeaderSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && headerSearch.trim()) {
      router.push(`/students?search=${encodeURIComponent(headerSearch.trim())}`);
    }
  }

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
            <nav className="flex flex-col gap-1 text-sm font-medium">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link 
                    key={item.href} 
                    href={item.href} 
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                      isActive 
                        ? "bg-primary text-white shadow-md shadow-primary/25" 
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </nav>
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
              <div className="relative w-full max-w-sm hidden md:block">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={tCommon("searchPlaceholder")}
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  onKeyDown={handleHeaderSearch}
                  className="h-9 w-full rounded-full border border-input bg-muted/50 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
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
