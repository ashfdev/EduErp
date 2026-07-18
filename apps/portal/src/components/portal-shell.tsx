"use client";

import { ProtectedRoute } from "./protected-route";
import { BottomNav } from "./bottom-nav";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { UserCircle2 } from "lucide-react";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { students, activeStudentId, setActiveStudent } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b shadow-sm">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-contain" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-white">E</div>
              )}
              <span className="truncate text-sm font-semibold tracking-tight text-foreground">{institutionName ?? "Education ERP"}</span>
            </div>
            <UserCircle2 className="h-6 w-6 text-muted-foreground" />
          </div>
          
          {students.length > 1 && (
            <div className="mx-auto flex max-w-md gap-2 overflow-x-auto px-4 py-2 border-t border-slate-100 bg-white/50">
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveStudent(s.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    s.id === activeStudentId 
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.name_en}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="mx-auto max-w-md">{children}</div>
        
        <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md">
          <BottomNav />
        </div>
      </div>
    </ProtectedRoute>
  );
}
