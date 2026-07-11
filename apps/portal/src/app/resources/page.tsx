"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Badge, Button, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface ResourceRow {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  original_filename: string;
  created_at: string;
  due_date: string | null;
  subject: { name_en: string } | null;
  teacher: { name_en: string } | null;
}

interface Submission {
  id: string;
  original_filename: string;
  status: string;
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  LECTURE_SLIDE: "Lecture Slide",
  HANDOUT: "Handout",
  ASSIGNMENT: "Assignment",
  OTHER: "Other",
};

function AssignmentSubmissionBlock({ resourceId, studentId }: { resourceId: string; studentId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: submission } = useQuery<Submission | null>({
    queryKey: ["portal", "submission", resourceId, studentId],
    queryFn: async () => (await api.get(`/api/portal/student/${studentId}/resources/${resourceId}/submission`)).data.data,
  });

  const submitMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/api/portal/student/${studentId}/resources/${resourceId}/submit`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Work submitted");
      queryClient.invalidateQueries({ queryKey: ["portal", "submission", resourceId, studentId] });
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  return (
    <div className="mt-3 rounded-md border border-dashed p-3">
      {submission ? (
        <div className="text-sm">
          <p>Submitted: {submission.original_filename} <Badge variant={submission.status === "GRADED" ? "default" : "outline"}>{submission.status}</Badge></p>
          {submission.status === "GRADED" && (
            <p className="mt-1 text-xs text-gray-600">Grade: {submission.grade} {submission.feedback && `· ${submission.feedback}`}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Not submitted yet.</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <input ref={fileRef} type="file" className="text-xs" />
        <Button size="sm" onClick={() => fileRef.current?.files?.[0] && submitMutation.mutate(fileRef.current.files[0])} disabled={submitMutation.isPending}>
          {submission ? "Resubmit" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

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
                  {r.due_date && ` · Due ${new Date(r.due_date).toLocaleDateString()}`}
                </p>
              </div>
              <Badge variant="outline">{RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type}</Badge>
            </div>
            <button onClick={() => download(r.id)} className="mt-3 text-sm text-[var(--primary,#1a3c4a)] hover:underline">
              Download {r.original_filename} →
            </button>
            {r.resource_type === "ASSIGNMENT" && activeStudentId && (
              <AssignmentSubmissionBlock resourceId={r.id} studentId={activeStudentId} />
            )}
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
