"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, CardContent, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, RichTextEditor, StatusBadge, extractErrorMessage, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Notice {
  id: string;
  title: string;
  body: string;
  audience: string;
  include_signature: boolean;
  is_pinned: boolean;
  is_published: boolean;
  is_public_website: boolean;
  send_sms: boolean;
  sms_sent_at: string | null;
  created_at: string;
}

function isBodyEmpty(html: string): boolean {
  return !html || html === "<p></p>";
}

export default function NoticesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contentMode, setContentMode] = useState<"write" | "upload">("write");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [audience, setAudience] = useState("PUBLIC");
  const [isPinned, setIsPinned] = useState(false);
  const [isPublicWebsite, setIsPublicWebsite] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(false);

  const { data: notices } = useQuery<Notice[]>({
    queryKey: ["website", "notices", filter],
    queryFn: async () => (await api.get("/api/website/notices", { params: filter ? { audience: filter } : {} })).data.data,
  });

  function resetForm() {
    setTitle("");
    setBody("");
    setContentMode("write");
    setAttachmentFile(null);
    setAudience("PUBLIC");
    setIsPinned(false);
    setIsPublicWebsite(true);
    setSendSms(false);
    setIncludeSignature(false);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (attachmentFile) {
        const form = new FormData();
        form.append("title", title);
        form.append("body", contentMode === "write" ? body : "");
        form.append("audience", audience);
        form.append("is_pinned", String(isPinned));
        form.append("is_public_website", String(isPublicWebsite));
        form.append("send_sms", String(sendSms));
        form.append("include_signature", String(includeSignature));
        form.append("attachment", attachmentFile);
        return api.post("/api/website/notices", form, { headers: { "Content-Type": "multipart/form-data" } });
      }
      return api.post("/api/website/notices", {
        title,
        body,
        audience,
        is_pinned: isPinned,
        is_public_website: isPublicWebsite,
        send_sms: sendSms,
        include_signature: includeSignature,
      });
    },
    onSuccess: () => {
      toast.success("Notice created");
      queryClient.invalidateQueries({ queryKey: ["website", "notices"] });
      setOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to create notice";
      toast.error(message);
    },
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead><TableHead>Audience</TableHead><TableHead>Pinned</TableHead>
                  <TableHead>Published</TableHead><TableHead>SMS</TableHead><TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notices.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>{n.title}</TableCell>
                    <TableCell><StatusBadge status={n.audience} /></TableCell>
                    <TableCell>{n.is_pinned ? "📌" : ""}</TableCell>
                    <TableCell><StatusBadge status={n.is_published ? "PUBLISHED" : "DRAFT"} /></TableCell>
                    <TableCell>{n.sms_sent_at ? "Sent" : n.send_sms ? "Pending" : "-"}</TableCell>
                    <TableCell className="space-x-2">
                      {n.is_published ? (
                        <Button size="sm" variant="outline" onClick={() => unpublishMutation.mutate(n.id)}>Unpublish</Button>
                      ) : (
                        <Button size="sm" onClick={() => publishMutation.mutate(n.id)}>Publish</Button>
                      )}
                      {n.is_published && <Button size="sm" variant="outline" onClick={() => sendSmsMutation.mutate(n.id)}>Send SMS</Button>}
                      {n.is_published && n.is_public_website && (
                        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/content/notices/${n.id}/pdf`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline">PDF</Button>
                        </a>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(n.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Notice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>

            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={contentMode === "write" ? "default" : "outline"} onClick={() => setContentMode("write")}>
                  Write content
                </Button>
                <Button type="button" size="sm" variant={contentMode === "upload" ? "default" : "outline"} onClick={() => setContentMode("upload")}>
                  Upload a document
                </Button>
              </div>
              {contentMode === "write" ? (
                <RichTextEditor value={body} onChange={setBody} />
              ) : (
                <div className="space-y-1.5">
                  <Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} />
                  <p className="text-xs text-muted-foreground">
                    {attachmentFile ? attachmentFile.name : "Choose a file — viewers can view/download it the same way a written notice is shown."}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Audience</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {["PUBLIC", "STUDENTS", "STAFF", "GUARDIANS", "ALL"].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={isPinned} onCheckedChange={(v) => setIsPinned(!!v)} /> Pin this notice</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={isPublicWebsite} onCheckedChange={(v) => setIsPublicWebsite(!!v)} /> Show on public website</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={sendSms} onCheckedChange={(v) => setSendSms(!!v)} /> Send SMS on publish</label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeSignature} onCheckedChange={(v) => setIncludeSignature(!!v)} /> Include authority signature on the PDF
            </label>
          </div>
          <DialogFooter>
            <Button
              disabled={!title || (contentMode === "write" ? isBodyEmpty(body) : !attachmentFile) || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Saving..." : "Save Notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
