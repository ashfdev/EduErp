"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner } from "@education-erp/ui";

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [isAuthenticated, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <LoadingSpinner />
    </main>
  );
}
