"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Textarea, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ComplaintRow {
  id: string;
  category: string;
  description: string;
  status: string;
  resolution_notes?: string | null;
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
  raised_by_name: string | null;
  messages: ComplaintMessage[];
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function ComplaintsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category: "ACADEMIC", description: "" });
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveDraft, setResolveDraft] = useState({ status: "RESOLVED", resolution_notes: "" });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: complaints } = useQuery<ComplaintRow[]>({
    queryKey: ["complaints"],
    queryFn: async () => (await api.get("/api/complaints")).data.data,
  });

  const { data: thread } = useQuery<ComplaintDetail>({
    queryKey: ["complaints", threadId],
    queryFn: async () => (await api.get(`/api/complaints/${threadId}`)).data.data,
    enabled: !!threadId,
  });

  const replyMutation = useMutation({
    mutationFn: () => api.post(`/api/complaints/${threadId}/messages`, { message: reply }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["complaints", threadId] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to send reply";
      toast.error(message);
    },
  });

  async function downloadExcel() {
    const res = await api.get("/api/complaints/export", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Complaints.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/complaints", draft),
    onSuccess: () => {
      toast.success("Complaint submitted");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setOpen(false);
      setDraft({ category: "ACADEMIC", description: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/api/complaints/${resolveId}`, resolveDraft),
    onSuccess: () => {
      toast.success("Complaint updated");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setResolveId(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Only ADMIN/PRINCIPAL can update status";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Complaints"
        subtitle="Raise or manage complaints and grievances"
        breadcrumbs={[{ label: "Complaints" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel}>Export Excel</Button>
            <Button onClick={() => setOpen(true)}>+ Raise Complaint</Button>
          </div>
        }
      />

      {!complaints?.length && <EmptyState title="No complaints" />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Date</th>
                <th className="p-2">Category</th>
                <th className="p-2">Description</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {complaints?.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="p-2"><Badge variant="outline">{c.category}</Badge></td>
                  <td className="p-2">{c.description}</td>
                  <td className="p-2"><Badge variant={c.status === "RESOLVED" || c.status === "CLOSED" ? "default" : "outline"}>{c.status}</Badge></td>
                  <td className="p-2 space-x-2">
                    <Button size="sm" variant="outline" onClick={() => { setThreadId(c.id); setReply(""); }}>
                      Thread
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setResolveId(c.id); setResolveDraft({ status: c.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED", resolution_notes: c.resolution_notes ?? "" }); }}>
                      Update
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise Complaint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
                <option value="ACADEMIC">Academic</option>
                <option value="FACILITY">Facility</option>
                <option value="STAFF_CONDUCT">Staff Conduct</option>
                <option value="BULLYING">Bullying</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !draft.description}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolveId} onOpenChange={(o) => !o && setResolveId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Complaint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={resolveDraft.status} onChange={(e) => setResolveDraft((p) => ({ ...p, status: e.target.value }))}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Resolution Notes</Label><Input value={resolveDraft.resolution_notes} onChange={(e) => setResolveDraft((p) => ({ ...p, resolution_notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!threadId} onOpenChange={(o) => !o && setThreadId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complaint Thread</DialogTitle></DialogHeader>
          {thread && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{thread.raised_by_name ?? "Requester"}</span>
                  <Badge variant={thread.status === "RESOLVED" || thread.status === "CLOSED" ? "default" : "outline"}>{thread.status}</Badge>
                </div>
                <p>{thread.description}</p>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {thread.messages.map((m) => (
                  <div key={m.id} className="rounded-md bg-muted/50 p-2 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{m.sender_name ?? "User"}</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1">{m.message}</p>
                  </div>
                ))}
                {!thread.messages.length && <p className="text-sm text-muted-foreground">No replies yet.</p>}
              </div>
              {thread.status !== "CLOSED" ? (
                <div className="space-y-1.5">
                  <Label>Reply</Label>
                  <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">This complaint is closed — file a new complaint instead of replying here.</p>
              )}
            </div>
          )}
          <DialogFooter>
            {thread?.status !== "CLOSED" && (
              <Button onClick={() => replyMutation.mutate()} disabled={replyMutation.isPending || !reply.trim()}>
                {replyMutation.isPending ? "Sending..." : "Send Reply"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
