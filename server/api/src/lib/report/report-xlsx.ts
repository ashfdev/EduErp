import ExcelJS from "exceljs";
import {
  brandColorHex,
  brandContactLine,
  formatDateTime,
  type ReportBranding,
  type ReportCell,
  type ReportColumn,
  type ReportSection,
  type ReportSpec,
  type ReportTone,
} from "./report-spec";

const TONE_STYLE: Record<ReportTone, { font: string; fill?: string }> = {
  good: { font: "FF15803D", fill: "FFDCFCE7" },
  bad: { font: "FFB91C1C", fill: "FFFEE2E2" },
  warn: { font: "FFB45309", fill: "FFFEF3C7" },
  muted: { font: "FF64748B" },
};
// Excel stores only the font name, so use one installed on every PC.
const EXCEL_FONT = "Calibri";
const BORDER_COLOR = { argb: "FFE2E8F0" };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: BORDER_COLOR },
  bottom: { style: "thin", color: BORDER_COLOR },
  left: { style: "thin", color: BORDER_COLOR },
  right: { style: "thin", color: BORDER_COLOR },
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

// Excel forbids []:*?/\ in sheet names, caps them at 31 chars, and needs them unique.
function uniqueSheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, "-").slice(0, 31) || "Sheet";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

function cellValue<R>(column: ReportColumn<R>, value: ReportCell): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (column.type === "dateOnly" && value instanceof Date) {
    // Re-anchor the @db.Date's UTC calendar day so Excel shows that same day.
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  return value;
}

function numFmt(type: ReportColumn<unknown>["type"]): string | undefined {
  switch (type) {
    case "number":
      return "#,##0";
    case "percent":
      return '0.0"%"';
    case "dateOnly":
      return "dd/mm/yyyy";
    case "dateTime":
      return "dd/mm/yyyy hh:mm AM/PM";
    default:
      return undefined;
  }
}

function defaultAlign(type: ReportColumn<unknown>["type"]): "left" | "center" | "right" {
  if (type === "number" || type === "percent") return "right";
  if (type === "code" || type === "dateOnly" || type === "dateTime") return "center";
  return "left";
}

function addMergedLine(sheet: ExcelJS.Worksheet, lastCol: number, text: string, font: Partial<ExcelJS.Font>, height?: number) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, lastCol);
  row.getCell(1).font = { name: EXCEL_FONT, ...font };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  if (height) row.height = height;
  return row;
}

function addSection<R>(workbook: ExcelJS.Workbook, spec: ReportSpec<R>, section: ReportSection<R>, branding: ReportBranding, usedNames: Set<string>) {
  const brand = brandColorHex(branding.primary_color);
  const lastCol = Math.max(section.columns.length, 4);
  const sheet = workbook.addWorksheet(uniqueSheetName(section.title, usedNames), {
    pageSetup: {
      paperSize: 9,
      orientation: spec.orientation ?? "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    },
    headerFooter: { oddFooter: `&L&8${branding.name_en.replace(/&/g, "&&")}&R&8Page &P of &N` },
  });

  addMergedLine(sheet, lastCol, branding.name_en, { bold: true, size: 16, color: { argb: `FF${brand}` } }, 26);
  const contact = brandContactLine(branding);
  if (contact) addMergedLine(sheet, lastCol, contact, { size: 9, color: { argb: "FF64748B" } });
  addMergedLine(sheet, lastCol, section.subtitle ? `${spec.title} — ${section.subtitle}` : spec.title, { bold: true, size: 13 }, 22);
  const generated = `Generated ${formatDateTime(spec.generatedAt ?? new Date())}${spec.generatedBy ? ` by ${spec.generatedBy}` : ""}`;
  const filterText = spec.filters.map((f) => `${f.label}: ${f.value}`).join("   |   ");
  addMergedLine(sheet, lastCol, filterText ? `${filterText}   |   ${generated}` : generated, { size: 9, color: { argb: "FF475569" } });
  if (section.stats?.length) {
    addMergedLine(sheet, lastCol, section.stats.map((s) => `${s.label}: ${s.value}`).join("     "), { bold: true, size: 10, color: { argb: "FF0F172A" } }, 18);
  }
  sheet.addRow([]);

  const header = sheet.addRow(section.columns.map((c) => c.header));
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { name: EXCEL_FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill(`FF${brand}`);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BORDER;
  });
  section.columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width ?? 14;
  });

  if (!section.rows.length) {
    addMergedLine(sheet, lastCol, "No records match these filters.", { italic: true, size: 10, color: { argb: "FF64748B" } }, 22);
  }

  section.rows.forEach((row, rowIndex) => {
    const excelRow = sheet.addRow(section.columns.map((c) => cellValue(c, c.value(row, rowIndex))));
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const column = section.columns[colNumber - 1];
      if (!column) return;
      const tone = column.tone?.(row);
      const fmt = numFmt(column.type);
      if (fmt) cell.numFmt = fmt;
      cell.alignment = { vertical: "middle", horizontal: column.align ?? defaultAlign(column.type), wrapText: column.type === "text" || !column.type };
      cell.border = THIN_BORDER;
      cell.font = { name: EXCEL_FONT, size: 10, ...(tone && { color: { argb: TONE_STYLE[tone].font }, bold: tone === "bad" }) };
      const fill = (tone && TONE_STYLE[tone].fill) ?? (rowIndex % 2 === 1 ? "FFF8FAFC" : undefined);
      if (fill) cell.fill = solidFill(fill);
    });
  });

  if (section.rows.length && section.columns.some((c) => c.total)) {
    const totals = sheet.addRow(section.columns.map((c, i) => (c.total ? cellValue(c, c.total(section.rows)) : i === 0 ? "Total" : null)));
    totals.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const column = section.columns[colNumber - 1];
      if (!column) return;
      const fmt = numFmt(column.type);
      if (fmt) cell.numFmt = fmt;
      cell.font = { name: EXCEL_FONT, bold: true, size: 10 };
      cell.fill = solidFill("FFF1F5F9");
      cell.alignment = { vertical: "middle", horizontal: column.align ?? defaultAlign(column.type) };
      cell.border = { ...THIN_BORDER, top: { style: "medium", color: { argb: `FF${brand}` } } };
    });
  }

  if (section.rows.length) {
    sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + section.rows.length, column: section.columns.length } };
  }
  sheet.views = [{ state: "frozen", ySplit: header.number, showGridLines: false }];
  sheet.pageSetup.printTitlesRow = `${header.number}:${header.number}`;

  if (spec.legend?.length) {
    sheet.addRow([]);
    for (const line of spec.legend) addMergedLine(sheet, lastCol, line, { italic: true, size: 9, color: { argb: "FF64748B" } });
  }
}

export async function buildReportXlsx<R>(spec: ReportSpec<R>, branding: ReportBranding): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.name_en;
  workbook.title = spec.title;
  workbook.created = spec.generatedAt ?? new Date();
  const usedNames = new Set<string>();
  for (const section of spec.sections) addSection(workbook, spec, section, branding, usedNames);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
