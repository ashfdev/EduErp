"use client";

import { ProtectedRoute } from "./protected-route";
import { BottomNav } from "./bottom-nav";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { students, activeStudentId, setActiveStudent } = useAuthStore();
  const { institutionName, logoUrl } = useInstitution();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 pb-16">
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-white px-3 py-2">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-6 w-6 rounded object-contain" /> : null}
          <span className="truncate text-sm font-medium text-gray-700">{institutionName ?? "Education ERP"}</span>
        </div>
        {students.length > 1 && (
          <div className="sticky top-0 z-30 flex gap-2 overflow-x-auto border-b bg-white p-2">
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStudent(s.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${s.id === activeStudentId ? "bg-[var(--primary,#1a3c4a)] text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {s.name_en}
              </button>
            ))}
          </div>
        )}
        <div className="mx-auto max-w-md">{children}</div>
        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
