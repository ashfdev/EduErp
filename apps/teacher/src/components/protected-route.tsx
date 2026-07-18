"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner } from "@education-erp/ui";

const TEACHER_APP_ROLES = ["ADMIN", "SUPER_ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"];

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, hasHydrated } = useAuthStore();
  const forcedPasswordChange = !!user?.must_change_password && pathname !== "/change-password";

  useEffect(() => {
    if (!hasHydrated) return; // wait for localStorage rehydration before trusting isAuthenticated
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user && !TEACHER_APP_ROLES.includes(user.role)) {
      useAuthStore.getState().logout();
      router.replace("/login");
      return;
    }
    if (forcedPasswordChange) {
      router.replace("/change-password");
    }
  }, [hasHydrated, isAuthenticated, user, router, forcedPasswordChange]);

  if (!hasHydrated || !isAuthenticated || forcedPasswordChange) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
