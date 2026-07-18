"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Button } from "@education-erp/ui";
import { LanguageToggle } from "@/components/language-toggle";
import { useInstitution } from "@/hooks/use-institution";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/students", key: "students" },
  { href: "/alumni", key: "alumni" },
  { href: "/complaints", key: "complaints" },
  { href: "/document-requests", key: "documentRequests" },
  { href: "/attendance/mark", key: "attendance" },
  { href: "/examination", key: "examination" },
  { href: "/marks", key: "marks" },
  { href: "/results", key: "results" },
  { href: "/course-enrollment", key: "courseEnrollment" },
  { href: "/fees", key: "fees" },
  { href: "/accounts", key: "accounts" },
  { href: "/inventory", key: "inventory" },
  { href: "/admission", key: "admission" },
  { href: "/documents/print", key: "documents" },
  { href: "/website", key: "website" },
  { href: "/hr", key: "hr" },
  { href: "/library", key: "library" },
  { href: "/transport", key: "transport" },
  { href: "/hostel", key: "hostel" },
  { href: "/reports", key: "reports" },
  { href: "/notifications/bulk-sms", key: "bulkSms" },
  { href: "/settings/institution", key: "settings" },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, refreshToken, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const t = useTranslations("nav");
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
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 border-r bg-card">
          <div className="flex h-[60px] items-center gap-2 border-b px-4 font-semibold">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-8 w-8 shrink-0 rounded object-contain" /> : null}
            <span className="truncate">{institutionName ?? tCommon("appName")}</span>
          </div>
          <nav className="flex flex-col gap-1 p-3 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 hover:bg-accent">
                {t(item.key)}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex h-[60px] items-center justify-end gap-3 border-b px-6">
            {user && (
              <span className="text-sm text-muted-foreground">
                {user.name_en} · {user.role.replace(/_/g, " ")}
              </span>
            )}
            <LanguageToggle />
            <Button size="sm" variant="outline" onClick={handleLogout}>
              {tCommon("signOut")}
            </Button>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
