"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
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
      const message = extractErrorMessage(err) ?? t("documentUploadFailed");
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
      <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden rounded-lg bg-forest p-6 sm:p-8 text-white">
        <div className="relative z-10 flex items-center gap-4 sm:gap-5">
          <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg bg-white/20 flex items-center justify-center text-2xl font-bold text-white border border-white/10">
            {user?.name_en?.charAt(0) ?? "U"}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-1 text-white/75 font-medium opacity-90">
              {user?.name_en}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 space-y-6">
          <div className="rounded-lg border border-border bg-white p-6">
            <h3 className="mb-4 text-sm font-bold text-foreground">
              Profile Details
            </h3>
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-muted-foreground">{t("name")}</span>
                <span className="text-sm font-medium text-foreground mt-0.5">{user?.name_en}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-muted-foreground">{t("phone")}</span>
                <span className="text-sm font-medium text-foreground mt-0.5">{user?.phone}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-muted-foreground">{t("role")}</span>
                <span className="inline-flex mt-1 items-center rounded-lg bg-forest/5 px-2.5 py-1 text-xs font-bold text-forest w-fit capitalize">
                  {user?.role?.replace(/_/g, " ").toLowerCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-8 space-y-6">
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 sm:px-6 py-4">
              <h2 className="text-base font-bold text-foreground">
                {t("myDocuments")}
              </h2>
              <button 
                onClick={() => setUploadOpen(true)}
                className="flex min-h-[40px] shrink-0 items-center rounded-lg bg-primary px-3 text-xs font-bold text-white transition-colors hover:bg-primary/90"
              >
                {t("uploadDocument")}
              </button>
            </div>
            <div className="p-4">
              {!documents?.length && (
                <div className="py-8"><EmptyState title={t("noDocuments")} /></div>
              )}
              <div className="space-y-3">
                {documents?.map((d) => (
                  <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-4 transition-all hover:border-primary/20 hover:bg-muted/50">
                    <div>
                      <p className="font-bold text-foreground text-sm flex flex-wrap items-center gap-2 break-words">
                        {d.title}
                        <span className="text-[10px] font-bold text-forest bg-forest/5 px-2 py-0.5 rounded-md">{d.doc_type}</span>
                      </p>
                      <p className="text-xs font-medium text-muted-foreground mt-1">{d.original_filename} • {new Date(d.uploaded_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-4 mt-3 sm:mt-0">
                      <button onClick={() => download(d.id)} className="py-1 text-xs font-bold text-primary hover:underline">{t("download")}</button>
                      <button onClick={() => deleteMutation.mutate(d.id)} className="py-1 text-xs font-bold text-red-500 hover:underline">{t("delete")}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <div className="border-b border-border bg-muted/50 px-4 sm:px-6 py-4">
              <h2 className="text-base font-bold text-foreground">{t("myReviews")}</h2>
            </div>
            <div className="p-4">
              {!reviews?.length && (
                <div className="py-8"><EmptyState title={t("noReviews")} /></div>
              )}
              <div className="space-y-3">
                {reviews?.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-4 hover:border-primary/20 hover:bg-muted/50 transition-all">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-foreground text-sm">{r.template.name} <span className="text-muted-foreground font-medium mx-1">•</span> {r.review_period}</p>
                      <Badge variant={r.status === "ACKNOWLEDGED" ? "default" : "outline"} className={r.status === "ACKNOWLEDGED" ? "bg-emerald-500" : ""}>{r.status}</Badge>
                    </div>
                    {r.status !== "DRAFT" && (
                      <div className="mt-3">
                        <p className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1.5 rounded-lg inline-block mb-2">
                          {t("overallScore", { score: r.overall_score ?? 0 })}
                        </p>
                        {r.overall_comments && <p className="text-sm text-muted-foreground mt-1 italic">&ldquo;{r.overall_comments}&rdquo;</p>}
                        {r.status === "SUBMITTED" && (
                          <Button size="sm" className="mt-4 rounded-lg font-bold" onClick={() => acknowledgeMutation.mutate(r.id)} disabled={acknowledgeMutation.isPending}>
                            {t("acknowledge")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md rounded-lg p-6">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">{t("uploadDocumentTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">{t("documentType")}</Label>
              <select className="w-full rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="CERTIFICATE">{t("docCertificate")}</option>
                <option value="NID">{t("docNid")}</option>
                <option value="TIN">{t("docTin")}</option>
                <option value="CONTRACT">{t("docContract")}</option>
                <option value="OTHER">{t("docOther")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">{t("titleLabel")}</Label>
              <Input className="rounded-lg border-border bg-muted/50 font-medium px-4 py-2.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">{t("file")}</Label>
              <Input className="rounded-lg border-border bg-muted/50 cursor-pointer file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-bold file:text-white" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button className="w-full rounded-lg font-bold py-6 text-base" onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !title || !file}>
              {uploadMutation.isPending ? t("uploading") : t("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}
