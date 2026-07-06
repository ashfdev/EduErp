"use client";

import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Badge, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface ResourceRow {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  original_filename: string;
  created_at: string;
  subject: { name_en: string } | null;
  teacher: { name_en: string } | null;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  LECTURE_SLIDE: "Lecture Slide",
  HANDOUT: "Handout",
  ASSIGNMENT: "Assignment",
  OTHER: "Other",
};

function ResourcesContent() {
  const { activeStudentId } = useAuthStore();
  const { data, isLoading } = useQuery<ResourceRow[]>({
    queryKey: ["portal", "resources", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/resources`)).data.data,
    enabled: !!activeStudentId,
  });

  async function download(id: string) {
    const res = await api.get(`/api/portal/student/${activeStudentId}/resources/${id}/download`);
    window.open(res.data.data.url, "_blank");
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Resources</h1>
      {!data?.length && <EmptyState title="No resources shared yet" />}
      {data?.map((r) => (
        <Card key={r.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{r.title}</p>
                {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                <p className="mt-1 text-xs text-gray-400">
                  {r.subject ? `${r.subject.name_en} · ` : ""}{r.teacher ? `${r.teacher.name_en} · ` : ""}
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="outline">{RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type}</Badge>
            </div>
            <button onClick={() => download(r.id)} className="mt-3 text-sm text-[var(--primary,#1a3c4a)] hover:underline">
              Download {r.original_filename} →
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <PortalShell>
      <ResourcesContent />
    </PortalShell>
  );
}
