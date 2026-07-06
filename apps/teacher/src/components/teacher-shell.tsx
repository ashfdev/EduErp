"use client";

import { ProtectedRoute } from "./protected-route";
import { TeacherNav } from "./teacher-nav";

export function TeacherShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <TeacherNav />
        <div className="mx-auto max-w-3xl p-4">{children}</div>
      </div>
    </ProtectedRoute>
  );
}
