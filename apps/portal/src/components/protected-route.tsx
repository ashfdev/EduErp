"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { LoadingSpinner, Button } from "@education-erp/ui";
import type { PortalStudent } from "@/stores/auth-store";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, hasHydrated, user, setStudents, logout } = useAuthStore();
  const forcedPasswordChange = !!user?.must_change_password && pathname !== "/change-password";

  useEffect(() => {
    if (!hasHydrated) return; // wait for localStorage rehydration before trusting isAuthenticated
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (forcedPasswordChange) router.replace("/change-password");
  }, [hasHydrated, isAuthenticated, router, forcedPasswordChange]);

  const meQuery = useQuery({
    queryKey: ["portal", "me"],
    queryFn: async () => {
      const res = await api.get("/api/portal/me");
      setStudents(res.data.data.students as PortalStudent[]);
      return res.data.data;
    },
    enabled: isAuthenticated && !forcedPasswordChange,
    retry: 1,
  });

  if (!hasHydrated || !isAuthenticated || forcedPasswordChange) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Previously: a failed /portal/me request just left activeStudentId
  // permanently null with no error surfaced, and every activeStudentId-
  // gated page's own `isLoading || !data` spinner check never resolves in
  // that case — the app looked "stuck loading" forever with no way out.
  if (meQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">Could not load your account. Please check your connection and try again.</p>
        <div className="flex gap-2">
          <Button onClick={() => meQuery.refetch()}>Try Again</Button>
          <Button variant="outline" onClick={() => { logout(); router.replace("/login"); }}>Log Out</Button>
        </div>
      </div>
    );
  }

  if (meQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // A successful response with zero linked students is a real, distinct
  // state from "still loading" — every other page in this app assumes
  // activeStudentId is set and would otherwise spin forever.
  if (meQuery.data && Array.isArray(meQuery.data.students) && meQuery.data.students.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">No student record is linked to this account. Please contact the school office.</p>
        <Button variant="outline" onClick={() => { logout(); router.replace("/login"); }}>Log Out</Button>
      </div>
    );
  }

  return <>{children}</>;
}
