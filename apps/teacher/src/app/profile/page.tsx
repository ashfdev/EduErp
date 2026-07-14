"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("profile");
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
      toast.success(t("reviewAcknowledged"));
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
      toast.success(t("documentUploaded"));
      queryClient.invalidateQueries({ queryKey: ["staff", "me", "documents"] });
      setUploadOpen(false);
      setTitle(""); setFile(null); setDocType("CERTIFICATE");
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t("documentUploadFailed");
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/hr/staff/me/documents/${docId}`),
    onSuccess: () => {
      toast.success(t("documentRemoved"));
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
        <PageHeader title={t("title")} subtitle={user?.name_en} />

        <Card>
          <CardContent className="grid grid-cols-2 gap-3 pt-6 text-sm">
            <div><span className="text-muted-foreground">{t("name")}</span> {user?.name_en}</div>
            <div><span className="text-muted-foreground">{t("phone")}</span> {user?.phone}</div>
            <div><span className="text-muted-foreground">{t("role")}</span> {user?.role?.replace(/_/g, " ")}</div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{t("myDocuments")}</p>
            <Button size="sm" onClick={() => setUploadOpen(true)}>{t("uploadDocument")}</Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {!documents?.length && <EmptyState title={t("noDocuments")} />}
              <div className="space-y-2">
                {documents?.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{d.title} <span className="text-xs text-muted-foreground">({d.doc_type})</span></p>
                      <p className="text-xs text-muted-foreground">{d.original_filename} · {new Date(d.uploaded_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => download(d.id)} className="text-primary hover:underline">{t("download")}</button>
                      <button onClick={() => deleteMutation.mutate(d.id)} className="text-destructive hover:underline">{t("delete")}</button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">{t("myReviews")}</p>
          <Card>
            <CardContent className="pt-6">
              {!reviews?.length && <EmptyState title={t("noReviews")} />}
              <div className="space-y-2">
                {reviews?.map((r) => (
                  <div key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.template.name} · {r.review_period}</p>
                      <Badge variant={r.status === "ACKNOWLEDGED" ? "default" : "outline"}>{r.status}</Badge>
                    </div>
                    {r.status !== "DRAFT" && (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">{t("overallScore", { score: r.overall_score ?? 0 })}</p>
                        {r.overall_comments && <p className="text-xs text-muted-foreground">{r.overall_comments}</p>}
                        {r.status === "SUBMITTED" && (
                          <Button size="sm" className="mt-2" onClick={() => acknowledgeMutation.mutate(r.id)} disabled={acknowledgeMutation.isPending}>
                            {t("acknowledge")}
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
          <DialogHeader><DialogTitle>{t("uploadDocumentTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("documentType")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="CERTIFICATE">{t("docCertificate")}</option>
                <option value="NID">{t("docNid")}</option>
                <option value="TIN">{t("docTin")}</option>
                <option value="CONTRACT">{t("docContract")}</option>
                <option value="OTHER">{t("docOther")}</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>{t("titleLabel")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} /></div>
            <div className="space-y-1.5"><Label>{t("file")}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !title || !file}>
              {uploadMutation.isPending ? t("uploading") : t("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}
