import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildReportHtml } from "./report-html";
import { buildReportXlsx } from "./report-xlsx";
import { formatDateOnly, toReportDate, type ReportBranding, type ReportSpec } from "./report-spec";

const BRANDING: ReportBranding = {
  name_en: "Test School & College",
  name_bn: "টেস্ট স্কুল",
  logo_url: "javascript:alert(1)",
  eiin: "123456",
  address: "Dhaka",
  phone: "01700000000",
  email: "",
  primary_color: "#183028",
};

interface Row {
  name: string;
  marks: number;
  date: Date;
}

function spec(rows: Row[], extra: Partial<ReportSpec<Row>> = {}): ReportSpec<Row> {
  return {
    title: "Test Report",
    fileName: "test",
    filters: [{ label: "Class", value: "Class 8" }],
    generatedAt: new Date("2026-10-16T06:00:00Z"),
    sections: [
      {
        title: "Class 8",
        columns: [
          { header: "Name", value: (r) => r.name, width: 20 },
          { header: "Marks", value: (r) => r.marks, type: "number", total: (all) => all.reduce((n, r) => n + r.marks, 0), tone: (r) => (r.marks < 33 ? "bad" : undefined) },
          { header: "Day\nSa", value: (r) => r.date, type: "dateOnly" },
        ],
        rows,
        stats: [{ label: "Students", value: rows.length }],
      },
    ],
    ...extra,
  };
}

const ROWS: Row[] = [
  { name: "Rakib", marks: 80, date: new Date(Date.UTC(2026, 9, 1)) },
  { name: "<img src=x onerror=alert(1)>", marks: 20, date: new Date(Date.UTC(2026, 9, 2)) },
];

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

function headerRowOf(sheet: ExcelJS.Worksheet): number {
  return (sheet.views[0] as { ySplit?: number } | undefined)?.ySplit ?? 0;
}

describe("buildReportXlsx", () => {
  it("writes a branded header, a styled frozen table and a totals row", async () => {
    const sheet = (await readBack(await buildReportXlsx(spec(ROWS), BRANDING))).worksheets[0]!;
    expect(sheet.getCell("A1").value).toBe("Test School & College");
    const headerRow = headerRowOf(sheet);
    expect(sheet.getRow(headerRow).values).toEqual([undefined, "Name", "Marks", "Day\nSa"]);
    expect(sheet.getCell(headerRow + 2, 2).value).toBe(20);
    expect(sheet.getCell(headerRow + 2, 2).font.color?.argb).toBe("FFB91C1C");
    expect(sheet.getCell(headerRow + 3, 1).value).toBe("Total");
    expect(sheet.getCell(headerRow + 3, 2).value).toBe(100);
    expect(sheet.getCell(headerRow + 1, 1).font.name).toBe("Calibri");
  });

  it("keeps @db.Date values on the same calendar day", async () => {
    const sheet = (await readBack(await buildReportXlsx(spec(ROWS), BRANDING))).worksheets[0]!;
    const headerRow = headerRowOf(sheet);
    const value = sheet.getCell(headerRow + 1, 3).value as Date;
    expect(value.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("makes sheet names valid and unique", async () => {
    const twoSections = spec(ROWS);
    const section = twoSections.sections[0]!;
    twoSections.sections = [{ ...section, title: "Class 8/A: [x]" }, { ...section, title: "Class 8/A: [x]" }];
    const names = (await readBack(await buildReportXlsx(twoSections, BRANDING))).worksheets.map((w) => w.name);
    expect(names[0]).toBe("Class 8-A- -x-");
    expect(new Set(names).size).toBe(2);
  });

  it("says so when there are no rows", async () => {
    const sheet = (await readBack(await buildReportXlsx(spec([]), BRANDING))).worksheets[0]!;
    const texts: string[] = [];
    sheet.eachRow((row) => texts.push(String(row.getCell(1).value)));
    expect(texts).toContain("No records match these filters.");
  });
});

describe("buildReportHtml", () => {
  const html = buildReportHtml(spec(ROWS), BRANDING, "");

  it("escapes every user value", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("Test School &amp; College");
  });

  it("drops logo URLs that are not http(s) or data images", () => {
    expect(html).not.toContain("javascript:");
  });

  it("renders tones, totals, stats and two-line headers", () => {
    expect(html).toContain('class="tone-bad"');
    expect(html).toContain("<tfoot>");
    expect(html).toContain(">100<");
    expect(html).toContain("Day<br>Sa");
    expect(html).toContain("01/10/2026");
  });
});

describe("dates", () => {
  it("formats a @db.Date by its UTC calendar day", () => {
    expect(formatDateOnly(new Date(Date.UTC(2026, 0, 5)))).toBe("05/01/2026");
  });

  it("maps an instant to its Dhaka calendar day", () => {
    // 20:00 UTC on 14 Jan is 02:00 on 15 Jan in Dhaka.
    expect(toReportDate(new Date("2026-01-14T20:00:00Z"))?.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(toReportDate(null)).toBeNull();
  });
});
