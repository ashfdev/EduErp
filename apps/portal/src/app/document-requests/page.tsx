"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Badge, Button, Label, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, LoadingSpinner, EmptyState, ErrorState, PdfPreviewModal } from "@education-erp/ui";

interface DocumentRequestRow {
  id: string;
  doc_type: "TESTIMONIAL" | "TRANSFER_CERTIFICATE";
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  created_at: string;
}

function statusVariant(status: string): "default" | "outline" | "destructive" {
  if (status === "APPROVED") return "default";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

const STATUS_KEY = { PENDING: "statusPending", APPROVED: "statusApproved", REJECTED: "statusRejected" } as const;

function DocumentRequestsContent() {
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();
  const t = useTranslations("documentRequests");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<"TESTIMONIAL" | "TRANSFER_CERTIFICATE">("TESTIMONIAL");
  const [reason, setReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<DocumentRequestRow[]>({
    queryKey: ["portal", "document-requests", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/document-requests`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/student/${activeStudentId}/document-requests`, { doc_type: docType, reason: reason || undefined }),
    onSuccess: () => {
      toast.success(t("submitted"));
      queryClient.invalidateQueries({ queryKey: ["portal", "document-requests", activeStudentId] });
      setOpen(false);
      setReason("");
    },
  });

  async function download(requestId: string) {
    const res = await api.get(`/api/portal/student/${activeStudentId}/document-requests/${requestId}/download`);
    window.open(res.data.data.url, "_blank");
  }

  async function preview(requestId: string, docType: "TESTIMONIAL" | "TRANSFER_CERTIFICATE") {
    setPreviewTitle(t(docType === "TESTIMONIAL" ? "docTypeTestimonial" : "docTypeTransferCertificate"));
    setPreviewUrl(null);
    setPreviewOpen(true);
    const res = await api.get(`/api/portal/student/${activeStudentId}/document-requests/${requestId}/download`);
    setPreviewUrl(res.data.data.url);
  }

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
        <Button size="sm" onClick={() => setOpen(true)}>{t("request")}</Button>
      </div>

      {!data?.length && <EmptyState title={t("noRequests")} />}
      {data?.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-1 pt-6">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{t(r.doc_type === "TESTIMONIAL" ? "docTypeTestimonial" : "docTypeTransferCertificate")}</Badge>
              <Badge variant={statusVariant(r.status)}>{t(STATUS_KEY[r.status])}</Badge>
            </div>
            {r.status === "REJECTED" && r.rejection_reason && (
              <p className="text-sm text-red-600">{t("rejectionReason", { reason: r.rejection_reason })}</p>
            )}
            <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
            {r.status === "APPROVED" && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => preview(r.id, r.doc_type)}>{t("view")}</Button>
                <Button size="sm" variant="outline" onClick={() => download(r.id)}>{t("download")}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("requestTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("docType")}</Label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value as "TESTIMONIAL" | "TRANSFER_CERTIFICATE")}
              >
                <option value="TESTIMONIAL">{t("docTypeTestimonial")}</option>
                <option value="TRANSFER_CERTIFICATE">{t("docTypeTransferCertificate")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("reason")}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>{t("submit")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={previewTitle}
        pdfUrl={previewUrl}
        downloadLabel={t("download")}
        closeLabel={t("close")}
      />
    </div>
  );
}

export default function DocumentRequestsPage() {
  return (
    <PortalShell>
      <DocumentRequestsContent />
    </PortalShell>
  );
}
