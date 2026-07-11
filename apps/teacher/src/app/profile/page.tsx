"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TeacherShell } from "@/components/teacher-shell";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface StaffDocumentRow {
  id: string;
  doc_type: string;
  title: string;
  original_filename: string;
  uploaded_at: string;
}
interface ReviewRow {
  id: string;
  review_period: string;
  status: string;
  overall_score: number | null;
  overall_comments?: string | null;
  template: { name: string; criteria: { key: string; label: string; max_score: number }[] };
  scores: Record<string, number>;
}

export default function TeacherProfilePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docType, setDocType] = useState("CERTIFICATE");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: documents } = useQuery<StaffDocumentRow[]>({
    queryKey: ["staff", "me", "documents"],
    queryFn: async () => (await api.get("/api/hr/staff/me/documents")).data.data,
  });

  const { data: reviews } = useQuery<ReviewRow[]>({
    queryKey: ["appraisals", "me"],
    queryFn: async () => (await api.get("/api/appraisals/reviews", { params: { staff_id: "me" } })).data.data,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (reviewId: string) => api.put(`/api/appraisals/reviews/${reviewId}/acknowledge`),
    onSuccess: () => {
      toast.success("Review acknowledged");
      queryClient.invalidateQueries({ queryKey: ["appraisals", "me"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("doc_type", docType);
      formData.append("title", title);
      formData.append("file", file!);
      return api.post("/api/hr/staff/me/documents", formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      queryClient.invalidateQueries({ queryKey: ["staff", "me", "documents"] });
      setUploadOpen(false);
      setTitle(""); setFile(null); setDocType("CERTIFICATE");
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to upload document";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/hr/staff/me/documents/${docId}`),
    onSuccess: () => {
      toast.success("Document removed");
      queryClient.invalidateQueries({ queryKey: ["staff", "me", "documents"] });
    },
  });

  async function download(docId: string) {
    const res = await api.get(`/api/hr/staff/me/documents/${docId}/download`);
    window.open(res.data.data.url, "_blank");
  }

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title="My Profile" subtitle={user?.name_en} />

        <Card>
          <CardContent className="grid grid-cols-2 gap-3 pt-6 text-sm">
            <div><span className="text-muted-foreground">Name:</span> {user?.name_en}</div>
            <div><span className="text-muted-foreground">Phone:</span> {user?.phone}</div>
            <div><span className="text-muted-foreground">Role:</span> {user?.role?.replace(/_/g, " ")}</div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">My Documents</p>
            <Button size="sm" onClick={() => setUploadOpen(true)}>+ Upload Document</Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {!documents?.length && <EmptyState title="No documents uploaded yet" />}
              <div className="space-y-2">
                {documents?.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{d.title} <span className="text-xs text-muted-foreground">({d.doc_type})</span></p>
                      <p className="text-xs text-muted-foreground">{d.original_filename} · {new Date(d.uploaded_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => download(d.id)} className="text-primary hover:underline">Download</button>
                      <button onClick={() => deleteMutation.mutate(d.id)} className="text-destructive hover:underline">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">My Reviews</p>
          <Card>
            <CardContent className="pt-6">
              {!reviews?.length && <EmptyState title="No performance reviews yet" />}
              <div className="space-y-2">
                {reviews?.map((r) => (
                  <div key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.template.name} · {r.review_period}</p>
                      <Badge variant={r.status === "ACKNOWLEDGED" ? "default" : "outline"}>{r.status}</Badge>
                    </div>
                    {r.status !== "DRAFT" && (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">Overall Score: {r.overall_score}</p>
                        {r.overall_comments && <p className="text-xs text-muted-foreground">{r.overall_comments}</p>}
                        {r.status === "SUBMITTED" && (
                          <Button size="sm" className="mt-2" onClick={() => acknowledgeMutation.mutate(r.id)} disabled={acknowledgeMutation.isPending}>
                            Acknowledge
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageWrapper>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="CERTIFICATE">Certificate</option>
                <option value="NID">NID</option>
                <option value="TIN">TIN</option>
                <option value="CONTRACT">Contract</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. B.Ed Certificate" /></div>
            <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !title || !file}>
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}
