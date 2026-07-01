'use client';

import { useAuthStore } from '@/store/auth-store';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-xl font-semibold">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-gray-600">
        Phase 1: Settings, Students, Staff, and Attendance are live. Fee, Exam, Website, and
        Admission modules land in later phases (see ROADMAP.md).
      </p>
    </div>
  );
}
