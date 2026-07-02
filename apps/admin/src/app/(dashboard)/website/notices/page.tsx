"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Textarea, Checkbox, StatusBadge, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Notice {
  id: string;
  title: string;
  body: string;
  audience: string;
  is_pinned: boolean;
  is_published: boolean;
  is_public_website: boolean;
  send_sms: boolean;
  sms_sent_at: string | null;
  created_at: string;
}

export default function NoticesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("PUBLIC");
  const [isPinned, setIsPinned] = useState(false);
  const [isPublicWebsite, setIsPublicWebsite] = useState(true);
  const [sendSms, setSendSms] = useState(false);

  const { data: notices } = useQuery<Notice[]>({
    queryKey: ["website", "notices", filter],
    queryFn: async () => (await api.get("/api/website/notices", { params: filter ? { audience: filter } : {} })).data.data,
  });

  function resetForm() {
    setTitle("");
    setBody("");
    setAudience("PUBLIC");
    setIsPinned(false);
    setIsPublicWebsite(true);
    setSendSms(false);
  }

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/website/notices", { title, body, audience, is_pinned: isPinned, is_public_website: isPublicWebsite, send_sms: sendSms }),
    onSuccess: () => {
      toast.success("Notice created");
      queryClient.invalidateQueries({ queryKey: ["website", "notices"] });
      setOpen(false);
      resetForm();
    },
    onError: () => toast.error("Failed to create notice"),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/website/notices/${id}/publish`),
    onSuccess: () => {
      toast.success("Notice published");
      queryClient.invalidateQueries({ queryKey: ["website", "notices"] });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/website/notices/${id}/unpublish`),
    onSuccess: () => {
      toast.success("Notice unpublished");
      queryClient.invalidateQueries({ queryKey: ["website", "notices"] });
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/website/notices/${id}/send-sms`, {}),
    onSuccess: (res) => toast.success(`Queued SMS to ${res.data.data.queued} recipients`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/notices/${id}`),
    onSuccess: () => {
      toast.success("Notice removed");
      queryClient.invalidateQueries({ queryKey: ["website", "notices"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Notices"
        breadcrumbs={[{ label: "Website" }, { label: "Notices" }]}
        action={<Button onClick={() => setOpen(true)}>+ New Notice</Button>}
      />

      <div className="flex gap-2">
        {["", "PUBLIC", "STUDENTS", "STAFF", "GUARDIANS", "ALL"].map((a) => (
          <Button key={a} size="sm" variant={filter === a ? "default" : "outline"} onClick={() => setFilter(a)}>
            {a || "All"}
          </Button>
        ))}
      </div>

      {!notices?.length && <EmptyState title="No notices yet" />}
      {!!notices?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Title</th><th className="p-2">Audience</th><th className="p-2">Pinned</th>
                  <th className="p-2">Published</th><th className="p-2">SMS</th><th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id} className="border-b">
                    <td className="p-2">{n.title}</td>
                    <td className="p-2"><StatusBadge status={n.audience} /></td>
                    <td className="p-2">{n.is_pinned ? "📌" : ""}</td>
                    <td className="p-2"><StatusBadge status={n.is_published ? "PUBLISHED" : "DRAFT"} /></td>
                    <td className="p-2">{n.sms_sent_at ? "Sent" : n.send_sms ? "Pending" : "-"}</td>
                    <td className="p-2 space-x-2">
                      {n.is_published ? (
                        <Button size="sm" variant="outline" onClick={() => unpublishMutation.mutate(n.id)}>Unpublish</Button>
                      ) : (
                        <Button size="sm" onClick={() => publishMutation.mutate(n.id)}>Publish</Button>
                      )}
                      {n.is_published && <Button size="sm" variant="outline" onClick={() => sendSmsMutation.mutate(n.id)}>Send SMS</Button>}
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(n.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Notice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Body</Label><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {["PUBLIC", "STUDENTS", "STAFF", "GUARDIANS", "ALL"].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={isPinned} onCheckedChange={(v) => setIsPinned(!!v)} /> Pin this notice</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={isPublicWebsite} onCheckedChange={(v) => setIsPublicWebsite(!!v)} /> Show on public website</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={sendSms} onCheckedChange={(v) => setSendSms(!!v)} /> Send SMS on publish</label>
          </div>
          <DialogFooter>
            <Button disabled={!title || !body || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Saving..." : "Save Notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
