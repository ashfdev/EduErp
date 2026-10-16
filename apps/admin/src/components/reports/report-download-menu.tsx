"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  extractBlobErrorMessage,
  handleBatchDownloadResponse,
} from "@education-erp/ui";
import { api } from "@/lib/api";

type ReportFormat = "xlsx" | "pdf";
type Params = Record<string, string | number | undefined>;

// The server sends filename*=UTF-8''… so Bangla class names survive the download.
function fileNameFrom(header: unknown, fallback: string): string {
  if (typeof header !== "string") return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // malformed encoding — fall back to the plain filename below
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

export function ReportDownloadMenu({
  endpoint,
  params,
  fileName,
  disabled,
  label,
  size,
}: {
  endpoint: string;
  params: Params;
  fileName: string;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default";
}) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [busy, setBusy] = useState<ReportFormat | null>(null);

  async function download(format: ReportFormat) {
    setBusy(format);
    try {
      const res = await api.get(endpoint, { params: { ...params, format }, responseType: "blob" });
      if (await handleBatchDownloadResponse(res, router)) {
        toast.info(t("queued"));
        return;
      }
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res.headers["content-disposition"], `${fileName}.${format}`);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((await extractBlobErrorMessage(err)) ?? t("failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled || !!busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? t("preparing") : (label ?? t("download"))}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => download("xlsx")} className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          {t("excel")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download("pdf")} className="gap-2">
          <FileText className="h-4 w-4 text-red-600" />
          {t("pdf")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
