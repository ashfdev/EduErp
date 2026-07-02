"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { LoadingSpinner } from "@education-erp/ui";
import type { PortalStudent } from "@/stores/auth-store";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, setStudents } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useQuery({
    queryKey: ["portal", "me"],
    queryFn: async () => {
      const res = await api.get("/api/portal/me");
      setStudents(res.data.data.students as PortalStudent[]);
      return res.data.data;
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
