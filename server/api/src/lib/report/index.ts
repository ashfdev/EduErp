import type { Response } from "express";
import { z } from "zod";
import { getInstitutionBranding, renderHtmlToPdf } from "../../services/pdf.service";
import { getDocumentFontCss } from "../../services/document-fonts";
import type { BatchJobResult } from "../batch-job-registry";
import { prisma } from "../prisma";
import { buildReportHtml, escapeHtml } from "./report-html";
import { buildReportXlsx } from "./report-xlsx";
import type { ReportFormat, ReportSpec } from "./report-spec";

export * from "./report-spec";

export const reportFormatSchema = z.enum(["xlsx", "pdf"]).default("xlsx");

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function renderReport<R>(spec: ReportSpec<R>, format: ReportFormat): Promise<BatchJobResult> {
  const branding = await getInstitutionBranding();
  const stamped = { ...spec, generatedAt: spec.generatedAt ?? new Date() };
  if (format === "pdf") {
    const buffer = await renderHtmlToPdf(buildReportHtml(stamped, branding, await getDocumentFontCss()), {
      orientation: spec.orientation,
      footerLabel: escapeHtml(`${branding.name_en} · ${spec.title}`),
    });
    return { buffer, filename: `${spec.fileName}.pdf`, mimeType: "application/pdf" };
  }
  return { buffer: await buildReportXlsx(stamped, branding), filename: `${spec.fileName}.xlsx`, mimeType: XLSX_MIME };
}

export function sendReport(res: Response, { buffer, filename, mimeType }: BatchJobResult) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  res.setHeader("Content-Type", mimeType ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}

export async function reportAuthor(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name_en: true } });
  return user?.name_en ?? undefined;
}

// Readable in a file name on Windows, macOS and phones.
export function reportFileName(...parts: (string | undefined | null)[]): string {
  return parts
    .filter((p): p is string => !!p)
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 120);
}
