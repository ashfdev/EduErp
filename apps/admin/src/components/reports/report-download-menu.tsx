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

// Downloads a file from the API, keeping the server's file name. Returns false
// when the server queued it as a background job (the caller is redirected).
export async function downloadFromApi(
  endpoint: string,
  params: Params,
  fallbackName: string,
  router: { push: (href: string) => void },
): Promise<boolean> {
  const res = await api.get(endpoint, { params, responseType: "blob" });
  if (await handleBatchDownloadResponse(res, router)) return false;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFrom(res.headers["content-disposition"], fallbackName);
  a.click();
  URL.revokeObjectURL(url);
  return true;
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
      if (!(await downloadFromApi(endpoint, { ...params, format }, `${fileName}.${format}`, router))) toast.info(t("queued"));
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
