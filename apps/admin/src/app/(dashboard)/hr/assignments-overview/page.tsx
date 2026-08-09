"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, SearchInput, Badge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Assignment {
  class_name: string;
  section_name: string;
  subject_name: string;
}
interface TeacherRow {
  staff_id: string;
  name_en: string;
  staff_uid: string;
  phone: string | null;
  designation: string | null;
  role: string;
  assignments: Assignment[];
}

export default function AssignmentsOverviewPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<TeacherRow[]>({
    queryKey: ["staff", "assignments-overview", search],
    queryFn: async () => (await api.get("/api/staff/assignments-overview", { params: { search: search || undefined } })).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Teacher Assignment Overview"
        subtitle="Every teacher's subject/class/section assignments in one place, with contact info."
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Assignment Overview" }]}
      />

      <SearchInput
        placeholder="Search by name, staff ID, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load teacher assignments" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState title="No teachers found" description="Try a different search, or confirm teaching staff have been added under HR." />
      ) : (
        <div className="space-y-4">
          {data.map((t) => (
            <Card key={t.staff_id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{t.name_en}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.staff_uid} · {t.designation ?? t.role.replace(/_/g, " ")} {t.phone ? `· ${t.phone}` : ""}
                    </div>
                  </div>
                  <Badge variant={t.assignments.length ? "success" : "warning"}>
                    {t.assignments.length} assignment{t.assignments.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                {t.assignments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {t.assignments.map((a, i) => (
                      <span key={i} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                        {a.subject_name} — {a.class_name} ({a.section_name})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No subject assigned yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
