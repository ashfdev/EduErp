"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  extractErrorMessage,
} from "@education-erp/ui";

interface StudentRef {
  id: string;
  name_en: string;
  student_uid: string;
  current_section?: { name: string } | null;
}
interface ClassTeacherPendingRow {
  id: string;
  from_date: string;
  to_date: string;
  reason: string;
  student: StudentRef;
}
interface SubjectTeacherPendingRow {
  id: string;
  leave_request: { id: string; from_date: string; to_date: string; reason: string; student: StudentRef };
}
interface PendingResponse {
  class_teacher_pending: ClassTeacherPendingRow[];
  subject_teacher_pending: SubjectTeacherPendingRow[];
}

function StudentLeaveApprovalsContent() {
  const queryClient = useQueryClient();
  const t = useTranslations("studentLeave");
  const [rejectTarget, setRejectTarget] = useState<{ kind: "request" | "approval"; id: string } | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery<PendingResponse>({
    queryKey: ["student-leave", "pending"],
    queryFn: async () => (await api.get("/api/student-leave/pending")).data.data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["student-leave", "pending"] });

  const approveRequestMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/student-leave/requests/${id}/approve`),
    onSuccess: () => {
      toast.success(t("approved"));
      invalidate();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? t("actionFailed")),
  });

  const approveApprovalMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/student-leave/approvals/${id}/approve`),
    onSuccess: () => {
      toast.success(t("approved"));
      invalidate();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? t("actionFailed")),
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!rejectTarget) return Promise.reject(new Error("No leave request selected"));
      const path = rejectTarget.kind === "request" ? `/api/student-leave/requests/${rejectTarget.id}/reject` : `/api/student-leave/approvals/${rejectTarget.id}/reject`;
      return api.put(path, { reason });
    },
    onSuccess: () => {
      toast.success(t("rejected"));
      setRejectTarget(null);
      setReason("");
      invalidate();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? t("actionFailed")),
  });

  const classTeacherPending = data?.class_teacher_pending ?? [];
  const subjectTeacherPending = data?.subject_teacher_pending ?? [];

  return (
    <TeacherShell>
      <div className="space-y-4 lg:space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        {!isLoading && (
          <Tabs defaultValue="class">
            <TabsList>
              <TabsTrigger value="class">{t("classTeacherTab", { count: classTeacherPending.length })}</TabsTrigger>
              <TabsTrigger value="subject">{t("subjectTeacherTab", { count: subjectTeacherPending.length })}</TabsTrigger>
            </TabsList>

            <TabsContent value="class">
              {!classTeacherPending.length && <EmptyState title={t("noPending")} />}
              <div className="space-y-2">
                {classTeacherPending.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="flex items-center justify-between gap-4 pt-6">
                      <div>
                        <p className="font-medium">
                          {r.student.name_en} <span className="text-xs text-muted-foreground">({r.student.student_uid}{r.student.current_section ? ` · ${r.student.current_section.name}` : ""})</span>
                        </p>
                        <p className="text-sm">
                          {new Date(r.from_date).toLocaleDateString()} – {new Date(r.to_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.reason}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setRejectTarget({ kind: "request", id: r.id }); setReason(""); }}>
                          {t("reject")}
                        </Button>
                        <Button size="sm" onClick={() => approveRequestMutation.mutate(r.id)} disabled={approveRequestMutation.isPending}>
                          {t("approve")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="subject">
              {!subjectTeacherPending.length && <EmptyState title={t("noPending")} />}
              <div className="space-y-2">
                {subjectTeacherPending.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="flex items-center justify-between gap-4 pt-6">
                      <div>
                        <p className="font-medium">
                          {a.leave_request.student.name_en}{" "}
                          <span className="text-xs text-muted-foreground">({a.leave_request.student.student_uid})</span>
                        </p>
                        <p className="text-sm">
                          {new Date(a.leave_request.from_date).toLocaleDateString()} – {new Date(a.leave_request.to_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">{a.leave_request.reason}</p>
                        <Badge variant="outline" className="mt-1">{t("yourApprovalOnly")}</Badge>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setRejectTarget({ kind: "approval", id: a.id }); setReason(""); }}>
                          {t("reject")}
                        </Button>
                        <Button size="sm" onClick={() => approveApprovalMutation.mutate(a.id)} disabled={approveApprovalMutation.isPending}>
                          {t("approve")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("rejectTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>{t("rejectionReasonLabel")}</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={!reason.trim() || rejectMutation.isPending}
              >
                {rejectMutation.isPending ? t("rejecting") : t("reject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TeacherShell>
  );
}

export default function StudentLeaveApprovalsPage() {
  return <StudentLeaveApprovalsContent />;
}
