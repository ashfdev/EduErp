"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Button } from "@education-erp/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, refreshToken, logout } = useAuthStore();

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
          <div className="flex h-[60px] items-center border-b px-4 font-semibold">Education ERP</div>
          <nav className="flex flex-col gap-1 p-3 text-sm">
            <Link href="/dashboard" className="rounded-md px-3 py-2 hover:bg-accent">
              Dashboard
            </Link>
            <Link href="/students" className="rounded-md px-3 py-2 hover:bg-accent">
              Students
            </Link>
            <Link href="/attendance/mark" className="rounded-md px-3 py-2 hover:bg-accent">
              Attendance
            </Link>
            <Link href="/examination" className="rounded-md px-3 py-2 hover:bg-accent">
              Examination
            </Link>
            <Link href="/marks" className="rounded-md px-3 py-2 hover:bg-accent">
              Marks
            </Link>
            <Link href="/results" className="rounded-md px-3 py-2 hover:bg-accent">
              Results
            </Link>
            <Link href="/settings/institution" className="rounded-md px-3 py-2 hover:bg-accent">
              Settings
            </Link>
          </nav>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex h-[60px] items-center justify-end gap-3 border-b px-6">
            {user && (
              <span className="text-sm text-muted-foreground">
                {user.name_en} · {user.role.replace(/_/g, " ")}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={handleLogout}>
              Sign Out
            </Button>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
