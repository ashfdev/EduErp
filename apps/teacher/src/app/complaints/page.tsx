"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Textarea, extractErrorMessage } from "@education-erp/ui";

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

function TeacherComplaintsContent() {
  const queryClient = useQueryClient();
  const t = useTranslations("complaints");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "ACADEMIC", description: "" });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data } = useQuery<ComplaintRow[]>({
    queryKey: ["complaints", "mine"],
    queryFn: async () => (await api.get("/api/complaints")).data.data,
  });

  const { data: thread } = useQuery<ComplaintDetail>({
    queryKey: ["complaints", threadId],
    queryFn: async () => (await api.get(`/api/complaints/${threadId}`)).data.data,
    enabled: !!threadId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/complaints", draft),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["complaints", "mine"] });
      setOpen(false);
      setDraft({ category: "ACADEMIC", description: "" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => api.post(`/api/complaints/${threadId}/messages`, { message: reply }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["complaints", threadId] });
      queryClient.invalidateQueries({ queryKey: ["complaints", "mine"] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? t("replyFailed");
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} action={<Button onClick={() => setOpen(true)}>{t("raise")}</Button>} />

        {!data?.length && <EmptyState title={t("noComplaints")} />}
        <div className="space-y-2">
          {data?.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-1 pt-6">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{c.category}</Badge>
                  <Badge variant={c.status === "RESOLVED" || c.status === "CLOSED" ? "default" : "outline"}>{c.status}</Badge>
                </div>
                <p className="text-sm">{c.description}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</p>
                  <Button size="sm" variant="outline" onClick={() => { setThreadId(c.id); setReply(""); }}>{t("viewThread")}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
                    <div key={m.id} className="rounded-md bg-muted/50 p-2 text-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{m.sender_name ?? "-"}</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-1">{m.message}</p>
                    </div>
                  ))}
                  {!thread.messages.length && <p className="text-sm text-muted-foreground">{t("noReplies")}</p>}
                </div>
                {thread.status !== "CLOSED" ? (
                  <div className="space-y-1.5">
                    <Label>{t("reply")}</Label>
                    <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("closedNotice")}</p>
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
      </PageWrapper>
    </TeacherShell>
  );
}

export default function TeacherComplaintsPage() {
  return <TeacherComplaintsContent />;
}
