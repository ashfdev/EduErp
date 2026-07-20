"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { api } from "@/lib/api";
import { Card, CardContent, Badge, Button, Input, Label, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, LoadingSpinner, EmptyState, ErrorState } from "@education-erp/ui";

interface ComplaintRow {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

interface ComplaintMessage {
  id: string;
  sender_user_id: string;
  sender_name: string | null;
  message: string;
  created_at: string;
}
interface ComplaintDetail extends ComplaintRow {
  messages: ComplaintMessage[];
}

function ComplaintsContent() {
  const queryClient = useQueryClient();
  const t = useTranslations("complaints");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "ACADEMIC", description: "" });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<ComplaintRow[]>({
    queryKey: ["portal", "complaints"],
    queryFn: async () => (await api.get("/api/portal/complaints")).data.data,
    retry: 1,
  });

  const { data: thread } = useQuery<ComplaintDetail>({
    queryKey: ["portal", "complaints", threadId],
    queryFn: async () => (await api.get(`/api/portal/complaints/${threadId}`)).data.data,
    enabled: !!threadId,
  });

  const replyMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/complaints/${threadId}/messages`, { message: reply }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["portal", "complaints", threadId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "complaints"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t("replyFailed");
      toast.error(message);
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/portal/complaints", draft),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["portal", "complaints"] });
      setOpen(false);
      setDraft({ category: "ACADEMIC", description: "" });
    },
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button size="sm" onClick={() => setOpen(true)}>{t("raise")}</Button>
      </div>

      {!data?.length && <EmptyState title={t("noComplaints")} />}
      {data?.map((c) => (
        <Card key={c.id}>
          <CardContent className="space-y-1 pt-6">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{c.category}</Badge>
              <Badge variant={c.status === "RESOLVED" || c.status === "CLOSED" ? "default" : "outline"}>{c.status}</Badge>
            </div>
            <p className="text-sm">{c.description}</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</p>
              <Button size="sm" variant="outline" onClick={() => { setThreadId(c.id); setReply(""); }}>{t("viewThread")}</Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("raiseTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("category")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
                <option value="ACADEMIC">{t("categoryAcademic")}</option>
                <option value="FACILITY">{t("categoryFacility")}</option>
                <option value="STAFF_CONDUCT">{t("categoryStaffConduct")}</option>
                <option value="BULLYING">{t("categoryBullying")}</option>
                <option value="OTHER">{t("categoryOther")}</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>{t("description")}</Label><Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !draft.description}>{t("submit")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!threadId} onOpenChange={(o) => !o && setThreadId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("threadTitle")}</DialogTitle></DialogHeader>
          {thread && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <Badge variant="outline">{thread.category}</Badge>
                  <Badge variant={thread.status === "RESOLVED" || thread.status === "CLOSED" ? "default" : "outline"}>{thread.status}</Badge>
                </div>
                <p>{thread.description}</p>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {thread.messages.map((m) => (
                  <div key={m.id} className="rounded-md bg-gray-50 p-2 text-sm">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="font-medium text-gray-700">{m.sender_name ?? "-"}</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1">{m.message}</p>
                  </div>
                ))}
                {!thread.messages.length && <p className="text-sm text-gray-500">{t("noReplies")}</p>}
              </div>
              {thread.status !== "CLOSED" ? (
                <div className="space-y-1.5">
                  <Label>{t("reply")}</Label>
                  <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                </div>
              ) : (
                <p className="text-xs text-gray-500">{t("closedNotice")}</p>
              )}
            </div>
          )}
          <DialogFooter>
            {thread?.status !== "CLOSED" && (
              <Button onClick={() => replyMutation.mutate()} disabled={replyMutation.isPending || !reply.trim()}>
                {replyMutation.isPending ? t("sending") : t("sendReply")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <PortalShell>
      <ComplaintsContent />
    </PortalShell>
  );
}
