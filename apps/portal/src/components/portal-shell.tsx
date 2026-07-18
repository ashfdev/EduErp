"use client";

import { ProtectedRoute } from "./protected-route";
import { PortalNav } from "./portal-nav";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { UserCircle2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { students, activeStudentId, setActiveStudent, logout } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-slate-50/50">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 border-r border-slate-800 bg-slate-900 shrink-0 h-screen sticky top-0 text-slate-300">
          <div className="flex shrink-0 items-center gap-3 px-6 py-5">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-sm font-bold text-white">E</div>
            )}
            <span className="line-clamp-2 leading-tight text-base font-bold tracking-tight text-white">{institutionName ?? "Education ERP"}</span>
          </div>
          
          {students.length > 1 && (
            <div className="px-6 py-4 border-y border-slate-800 bg-slate-900/50 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Switch Student</p>
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveStudent(s.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    s.id === activeStudentId 
                      ? "bg-primary/20 text-white border border-primary/50" 
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent"
                  }`}
                >
                  {s.name_en}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <PortalNav isMobile={false} />
          </div>

          <div className="mt-auto p-4 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 text-sm font-medium text-slate-400 hover:text-red-400 transition-colors p-3 rounded-xl hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col w-full relative pb-20 lg:pb-0">
          {/* Mobile Top Header */}
          <header className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-contain" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-white">E</div>
                )}
                <span className="line-clamp-2 leading-tight text-sm font-semibold tracking-tight text-foreground">{institutionName ?? "Education ERP"}</span>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-500">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
            
            {students.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 py-2 border-t border-slate-100 bg-white/50 no-scrollbar">
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

          <div className="mx-auto max-w-7xl w-full p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
        
        {/* Mobile Bottom Nav */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-900 pb-safe">
          <PortalNav isMobile={true} />
        </div>
      </div>
    </ProtectedRoute>
  );
}
