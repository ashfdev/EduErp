"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, StatusBadge, LoadingSpinner } from "@education-erp/ui";

interface Dashboard {
  student: { name: string; uid: string; class?: string; section?: string; roll?: string; photo: string | null };
  attendance: { today_status: string; this_month_percentage: number | null };
  upcoming_exams: { id: string; name: string; start_date: string | null }[];
  recent_results: { exam_name: string; gpa: number; grade: string }[];
  fee_dues: { total_outstanding: number; next_due_date: string | null; next_due_amount: number | null };
  recent_notices: { id: string; title: string; audience: string; created_at: string }[];
  homework: { pending: number; submitted: number; recent: { id: string; title: string; due_date: string }[] };
}

function HomeContent() {
  const { activeStudentId } = useAuthStore();
  const { terms } = useInstitution();

  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ["portal", "dashboard", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/dashboard`)).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-gray-200">
          {data.student.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.student.photo} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div>
          <p className="font-semibold">{greeting}, {data.student.name.split(" ")[0]}</p>
          <p className="text-xs text-gray-500">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <Link href="/profile" className="ml-auto text-xs text-[var(--primary,#1a3c4a)]">View Profile →</Link>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-6">
          <div className="flex items-center justify-between">
            <p className="font-medium">Today</p>
            <StatusBadge status={data.attendance.today_status} />
          </div>
          <p className="text-sm text-gray-500">{data.student.class} {data.student.section && `· ${terms.term_section} ${data.student.section}`} {data.student.roll && `· ${terms.term_roll} ${data.student.roll}`}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="pt-4 text-center"><p className="text-lg font-semibold">{data.attendance.this_month_percentage ?? "-"}%</p><p className="text-[10px] text-gray-500">This Month</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-lg font-semibold text-red-600">৳{data.fee_dues.total_outstanding}</p><p className="text-[10px] text-gray-500">Outstanding</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-lg font-semibold">{data.recent_results.length}</p><p className="text-[10px] text-gray-500">Results</p></CardContent></Card>
      </div>

      {!!data.upcoming_exams.length && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Upcoming Exams</p>
            {data.upcoming_exams.map((e) => {
              const days = e.start_date ? Math.ceil((new Date(e.start_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <div key={e.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
                  <span>{e.name}</span>
                  <div className="flex items-center gap-2">
                    {days !== null && <span className="text-xs text-gray-500">{days > 0 ? `in ${days}d` : "today"}</span>}
                    <Link href={`/admit-card/${e.id}`} className="text-xs text-[var(--primary,#1a3c4a)]">Admit Card →</Link>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <p className="font-medium">My {terms.term_class} Subjects</p>
          <Link href="/subjects" className="text-xs text-[var(--primary,#1a3c4a)]">View →</Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <p className="font-medium">Transport & Hostel</p>
          <Link href="/transport-hostel" className="text-xs text-[var(--primary,#1a3c4a)]">View →</Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <p className="font-medium">Resources</p>
          <Link href="/resources" className="text-xs text-[var(--primary,#1a3c4a)]">View →</Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Recent Notices</p>
            <Link href="/notices" className="text-xs text-[var(--primary,#1a3c4a)]">View All →</Link>
          </div>
          {!data.recent_notices.length && <p className="text-sm text-gray-500">No notices yet.</p>}
          {data.recent_notices.map((n) => (
            <div key={n.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
              <span>{n.title}</span>
              <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {!!data.recent_results.length && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">Recent Result</p>
            <p className="text-sm">{data.recent_results[0]!.exam_name}</p>
            <p className="text-lg font-semibold">GPA {data.recent_results[0]!.gpa} ({data.recent_results[0]!.grade})</p>
            <Link href="/results" className="text-xs text-[var(--primary,#1a3c4a)]">View Full Result →</Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Homework Due</p>
            <Link href="/homework" className="text-xs text-[var(--primary,#1a3c4a)]">View →</Link>
          </div>
          <p className="text-sm text-gray-600">{data.homework.pending} pending</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HomePage() {
  return (
    <PortalShell>
      <HomeContent />
    </PortalShell>
  );
}
