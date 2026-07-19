"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner, PdfPreviewModal } from "@education-erp/ui";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface Clearance {
  accounts: { required: boolean; clear: boolean; due_amount: number };
  library: { clear: boolean; fine_amount: number };
  exam_office: { clear: boolean };
  all_clear: boolean;
}

function ClearanceRow({ label, clear, detail }: { label: string; clear: boolean; detail?: string }) {
  const t = useTranslations("admitCard");
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <div>
        <p>{label}</p>
        {detail && <p className="text-xs text-gray-500">{detail}</p>}
      </div>
      <span className={clear ? "text-emerald-600" : "text-red-600"}>{clear ? t("clear") : t("pending")}</span>
    </div>
  );
}

function AdmitCardContent() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("admitCard");
  const pdfPreview = usePdfPreview();

  const { data, isLoading } = useQuery<Clearance>({
    queryKey: ["portal", "admit-card-clearance", activeStudentId, exam_id],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/admit-card/${exam_id}/clearance`)).data.data,
    enabled: !!activeStudentId,
  });

  async function download() {
    const res = await api.get(`/api/portal/student/${activeStudentId}/admit-card/${exam_id}`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admit-card.pdf";
    a.click();
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">{t("clearanceStatus")}</p>
          {data?.accounts.required && (
            <ClearanceRow label={t("accounts")} clear={data.accounts.clear} detail={data.accounts.clear ? undefined : t("dueAmount", { amount: data.accounts.due_amount })} />
          )}
          {data && (
            <>
              <ClearanceRow label={t("library")} clear={data.library.clear} detail={data.library.clear ? undefined : t("fineAmount", { amount: data.library.fine_amount })} />
              <ClearanceRow label={t("examOffice")} clear={data.exam_office.clear} detail={data.exam_office.clear ? undefined : t("awaitingSignoff")} />
            </>
          )}
        </CardContent>
      </Card>

      {data?.all_clear ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => pdfPreview.openPreview(`/api/portal/student/${activeStudentId}/admit-card/${exam_id}`, t("title"))}
          >
            {t("view")}
          </Button>
          <Button className="flex-1" onClick={download}>{t("download")}</Button>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-500">{t("clearPending")}</p>
      )}

      <PdfPreviewModal
        open={pdfPreview.open}
        onOpenChange={(open) => !open && pdfPreview.closePreview()}
        title={pdfPreview.title}
        pdfUrl={pdfPreview.url}
        downloadLabel={t("download")}
        closeLabel={t("close")}
      />
    </div>
  );
}

export default function AdmitCardPage() {
  return (
    <PortalShell>
      <AdmitCardContent />
    </PortalShell>
  );
}
