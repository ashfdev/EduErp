"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Badge, Button, Card, CardContent, ConfirmDialog, EmptyState, Label, PageHeader, PageWrapper, Switch, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface UnitStatus {
  class_id: string;
  class_name: string;
  group_id: string | null;
  group_name: string | null;
  student_count: number;
  expected_count: number;
  submitted_count: number;
  approved_count: number;
  is_complete: boolean;
  is_approved: boolean;
  is_published: boolean;
  is_public: boolean;
  published_at: string | null;
}

interface WholeCampusResult {
  published: { class_id: string; group_id: string | null }[];
  failed: { class_id: string; group_id: string | null; reason: string }[];
  already_published: number;
}

export default function ApproveMarksPage() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const queryClient = useQueryClient();
  const [isPublicByUnit, setIsPublicByUnit] = useState<Record<string, boolean>>({});
  const [confirmWholeCampus, setConfirmWholeCampus] = useState(false);

  const { data: units, isLoading } = useQuery<UnitStatus[]>({
    queryKey: ["marks", "publish-status", exam_id],
    queryFn: async () => (await api.get(`/api/marks/publish-status/${exam_id}`)).data.data,
  });

  const unitKey = (u: { class_id: string; group_id: string | null }) => `${u.class_id}:${u.group_id ?? ""}`;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["marks", "publish-status", exam_id] });
    queryClient.invalidateQueries();
  }

  const approveMutation = useMutation({
    mutationFn: ({ classId, groupId }: { classId: string; groupId: string | null }) =>
      api.post(`/api/marks/approve/${exam_id}/${classId}`, undefined, { params: groupId ? { group_id: groupId } : undefined }),
    onSuccess: (res) => {
      toast.success(`Approved ${res.data.data.approved} mark entries`);
      invalidate();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Approval failed";
      toast.error(message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: ({ classId, groupId }: { classId: string; groupId: string | null }) =>
      api.post(`/api/marks/publish/${exam_id}/${classId}`, { is_public: isPublicByUnit[unitKey({ class_id: classId, group_id: groupId })] ?? true, group_id: groupId ?? undefined }),
    onSuccess: () => {
      toast.success("Results published");
      invalidate();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Publish failed";
      toast.error(message);
    },
  });

  const wholeCampusMutation = useMutation({
    mutationFn: () => api.post<{ data: WholeCampusResult }>(`/api/marks/publish-whole-campus/${exam_id}`),
    onSuccess: (res) => {
      const { published, failed } = res.data.data;
      if (published.length > 0) toast.success(`Published ${published.length} class/group result${published.length === 1 ? "" : "s"}`);
      if (failed.length > 0) toast.error(`${failed.length} could not be published — still has unapproved marks`);
      if (published.length === 0 && failed.length === 0) toast.info("Nothing left to publish");
      invalidate();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Publish Whole Campus failed";
      toast.error(message);
    },
    onSettled: () => setConfirmWholeCampus(false),
  });

  const allReady = !!units?.length && units.every((u) => u.is_published || u.is_approved);
  const pendingCount = units?.filter((u) => !u.is_published).length ?? 0;

  return (
    <PageWrapper>
      <PageHeader
        title="Approve & Publish Results"
        subtitle="Each class — or each group within a class — completes and publishes independently"
        breadcrumbs={[{ label: "Marks", href: "/marks" }, { label: "Approve" }]}
        action={
          <Button onClick={() => setConfirmWholeCampus(true)} disabled={!allReady || wholeCampusMutation.isPending}>
            Publish Whole Campus
          </Button>
        }
      />

      {!isLoading && !units?.length && <EmptyState title="No classes tied to this exam yet" description="Add subjects to this exam's Subject Configuration first." />}

      <div className="space-y-3">
        {units?.map((u) => {
          const key = unitKey(u);
          return (
            <Card key={key}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="font-medium">
                      {u.class_name}
                      {u.group_name && <span className="text-muted-foreground"> — {u.group_name}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {u.submitted_count}/{u.expected_count} submitted · {u.approved_count}/{u.expected_count} approved · {u.student_count} student{u.student_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {u.is_published ? (
                    <Badge variant={u.is_public ? "success" : "warning"}>{u.is_public ? "Published · Public" : "Published · Not public"}</Badge>
                  ) : u.is_approved ? (
                    <Badge variant="success">Approved · Ready to publish</Badge>
                  ) : u.is_complete ? (
                    <Badge variant="warning">Mark entry complete · Needs approval</Badge>
                  ) : (
                    <Badge variant="outline">Mark entry in progress</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveMutation.mutate({ classId: u.class_id, groupId: u.group_id })}
                    disabled={!u.is_complete || u.is_approved || approveMutation.isPending}
                  >
                    Approve All
                  </Button>
                  <label className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1 text-sm">
                    <Switch
                      checked={isPublicByUnit[key] ?? true}
                      onCheckedChange={(v) => setIsPublicByUnit((prev) => ({ ...prev, [key]: v }))}
                    />
                    <Label>Public on website</Label>
                  </label>
                  <Button
                    size="sm"
                    onClick={() => publishMutation.mutate({ classId: u.class_id, groupId: u.group_id })}
                    disabled={!u.is_approved || publishMutation.isPending}
                  >
                    Publish Results
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmWholeCampus}
        onOpenChange={setConfirmWholeCampus}
        title="Publish Whole Campus?"
        description={`This publishes every class/group tied to this exam that is fully approved (${pendingCount} not yet published). Anything still incomplete or unapproved is skipped and reported.`}
        confirmLabel="Publish Whole Campus"
        loading={wholeCampusMutation.isPending}
        onConfirm={() => wholeCampusMutation.mutate()}
      />
    </PageWrapper>
  );
}
