"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ProtectedRoute } from "./protected-route";
import { TeacherNav } from "./teacher-nav";
import { useInstitution } from "@/hooks/use-institution";

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { institutionName } = useInstitution();

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-slate-50/50">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 border-r border-slate-800 bg-slate-900 shrink-0 h-screen sticky top-0">
          <TeacherNav isMobile={false} />
        </aside>

        <main className="flex-1 w-full relative pb-20 lg:pb-0 pt-14 lg:pt-0">
          {/* Mobile Top Header */}
          <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center px-4 shadow-sm">
            {pathname !== "/" ? (
              <button 
                onClick={() => router.back()} 
                className="flex items-center text-slate-600 hover:text-slate-900 font-bold transition-colors"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </button>
            ) : (
              <span className="font-bold text-slate-800">{institutionName ?? "Teacher Portal"}</span>
            )}
          </header>

          <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/90 backdrop-blur-lg pb-safe">
          <TeacherNav isMobile={true} />
        </nav>
      </div>
    </ProtectedRoute>
  );
}
