"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Switch, Label } from "@education-erp/ui";
import { useState } from "react";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
}

export default function ApproveMarksPage() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const queryClient = useQueryClient();
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

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
    mutationFn: (classId: string) => api.post(`/api/marks/publish/${exam_id}/${classId}`, { is_public: isPublicByClass[classId] ?? false }),
    onSuccess: () => {
      toast.success("Results published");
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
        {classes?.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between pt-6">
              <p className="font-medium">{c.name_en}</p>
              <div className="flex items-center gap-4">
                <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(c.id)} disabled={approveMutation.isPending}>
                  Approve All
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={isPublicByClass[c.id] ?? false} onCheckedChange={(v) => setIsPublicByClass((prev) => ({ ...prev, [c.id]: v }))} />
                  <Label>Public on website</Label>
                </label>
                <Button size="sm" onClick={() => publishMutation.mutate(c.id)} disabled={publishMutation.isPending}>
                  Publish Results
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageWrapper>
  );
}
