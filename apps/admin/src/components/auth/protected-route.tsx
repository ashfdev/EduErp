"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner } from "@education-erp/ui";

export function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, hasHydrated, user } = useAuthStore();
  const forcedPasswordChange = !!user?.must_change_password && pathname !== "/change-password";

  useEffect(() => {
    if (!hasHydrated) return; // wait for localStorage rehydration before trusting isAuthenticated
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (forcedPasswordChange) {
      router.replace("/change-password");
      return;
    }
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.replace("/403");
    }
  }, [hasHydrated, isAuthenticated, user, allowedRoles, router, forcedPasswordChange]);

  if (!hasHydrated || !isAuthenticated || forcedPasswordChange) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
