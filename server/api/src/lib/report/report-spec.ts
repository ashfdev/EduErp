export type ReportCell = string | number | Date | null | undefined;
export type ReportTone = "good" | "bad" | "warn" | "muted";
// "dateOnly" is a Prisma @db.Date (UTC midnight); "dateTime" is a real instant.
export type ReportColumnType = "text" | "number" | "percent" | "dateOnly" | "dateTime" | "code";

export interface ReportColumn<R> {
  header: string;
  value: (row: R, index: number) => ReportCell;
  type?: ReportColumnType;
  // Excel character width; the PDF uses it as a relative column weight.
  width?: number;
  align?: "left" | "center" | "right";
  tone?: (row: R) => ReportTone | undefined;
  total?: (rows: R[]) => ReportCell;
}

export interface ReportStat {
  label: string;
  value: string | number;
  tone?: ReportTone;
}

// One worksheet in Excel, one titled table (starting on a new page) in the PDF.
export interface ReportSection<R> {
  title: string;
  subtitle?: string;
  columns: ReportColumn<R>[];
  rows: R[];
  stats?: ReportStat[];
}

export interface ReportSpec<R> {
  title: string;
  fileName: string;
  filters: { label: string; value: string }[];
  sections: ReportSection<R>[];
  legend?: string[];
  orientation?: "portrait" | "landscape";
  generatedBy?: string;
  generatedAt?: Date;
}

export interface ReportBranding {
  name_en: string;
  name_bn: string;
  logo_url: string | null;
  eiin: string;
  address: string;
  phone: string;
  email: string;
  primary_color: string;
}

export type ReportFormat = "xlsx" | "pdf";

export const REPORT_TIME_ZONE = "Asia/Dhaka";

export function formatDateOnly(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// A real instant (e.g. admission_date) → its calendar day in REPORT_TIME_ZONE, as a "dateOnly" value.
export function toReportDate(d: Date | null | undefined): Date | null {
  if (!d) return null;
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1));
}

export function formatTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: REPORT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

export function formatDateTime(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: REPORT_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} ${(parts.dayPeriod ?? "").toUpperCase()}`;
}

export function brandColorHex(color: string | null | undefined): string {
  const hex = (color ?? "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : "1A3C4A";
}

export function brandContactLine(branding: ReportBranding): string {
  return [branding.address, branding.eiin && `EIIN: ${branding.eiin}`, branding.phone, branding.email].filter(Boolean).join("  •  ");
}

export function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}
