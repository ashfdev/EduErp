"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Switch, Label, Badge } from "@education-erp/ui";
import { useState } from "react";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
}

interface PublishStatus {
  class_id: string;
  is_published: boolean;
  is_public: boolean;
  published_at: string | null;
}

export default function ApproveMarksPage() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const queryClient = useQueryClient();
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  const { data: publishStatus } = useQuery<PublishStatus[]>({
    queryKey: ["marks", "publish-status", exam_id],
    queryFn: async () => (await api.get(`/api/marks/publish-status/${exam_id}`)).data.data,
  });
  const statusByClass = new Map((publishStatus ?? []).map((p) => [p.class_id, p]));

  // Defaults ON to match the API default — the switch exists to let staff
  // opt a class OUT of public visibility, not opt it in as an afterthought.
  const [isPublicByClass, setIsPublicByClass] = useState<Record<string, boolean>>({});

  const approveMutation = useMutation({
    mutationFn: (classId: string) => api.post(`/api/marks/approve/${exam_id}/${classId}`),
    onSuccess: (res) => toast.success(`Approved ${res.data.data.approved} mark entries`),
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Approval failed";
      toast.error(message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (classId: string) => api.post(`/api/marks/publish/${exam_id}/${classId}`, { is_public: isPublicByClass[classId] ?? true }),
    onSuccess: () => {
      toast.success("Results published");
      queryClient.invalidateQueries({ queryKey: ["marks", "publish-status", exam_id] });
      queryClient.invalidateQueries();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Publish failed";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Approve & Publish Results" breadcrumbs={[{ label: "Marks", href: "/marks" }, { label: "Approve" }]} />
      <div className="space-y-3">
        {classes?.map((c) => {
          const status = statusByClass.get(c.id);
          return (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.name_en}</p>
                  {status?.is_published && (
                    <Badge variant={status.is_public ? "success" : "warning"}>
                      {status.is_public ? "Published · Public" : "Published · Not public"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(c.id)} disabled={approveMutation.isPending}>
                    Approve All
                  </Button>
                  <label className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1 text-sm">
                    <Switch checked={isPublicByClass[c.id] ?? true} onCheckedChange={(v) => setIsPublicByClass((prev) => ({ ...prev, [c.id]: v }))} />
                    <Label>Public on website</Label>
                  </label>
                  <Button size="sm" onClick={() => publishMutation.mutate(c.id)} disabled={publishMutation.isPending}>
                    Publish Results
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageWrapper>
  );
}
