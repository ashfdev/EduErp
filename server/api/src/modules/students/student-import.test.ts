import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildImportTemplate, IMPORT_COLUMNS, mapHeader, normalizeRow, parseImportDate, parseStudentSheet, type ImportContext } from "./student-import";

const CTX: ImportContext = {
  classes: [
    { id: "c8", name_en: "Class 8", name_bn: null, numeric_level: 8, sections: [{ id: "c8a", name: "A" }, { id: "c8b", name: "B" }] },
    { id: "c9", name_en: "Class 9", name_bn: null, numeric_level: 9, sections: [] },
    { id: "c10", name_en: "Class 10", name_bn: null, numeric_level: 10, sections: [{ id: "c10a", name: "A" }] },
  ],
  groupsByClass: new Map([["c10", new Set(["SCI", "ARTS"])]]),
};

const BASE = { name_en: "Rakib", gender: "Male", class_section: "Class 8 - A", father_phone: "01712345678" };

describe("mapHeader", () => {
  it("maps template labels, required stars, legacy keys and Excel's UTF-8 marker", () => {
    expect(mapHeader("Student name (English) *")).toBe("name_en");
    expect(mapHeader("\ufeffname_en")).toBe("name_en");
    expect(mapHeader("Father's phone *")).toBe("father_phone");
    expect(mapHeader("current_class_id")).toBe("class");
    expect(mapHeader("Permanent address same as present?")).toBe("permanent_same");
  });

  it("gives every template column a unique key", () => {
    const keys = IMPORT_COLUMNS.map((c) => mapHeader(c.label));
    expect(new Set(keys).size).toBe(IMPORT_COLUMNS.length);
    expect(keys).toEqual(IMPORT_COLUMNS.map((c) => c.key));
  });
});

describe("parseStudentSheet", () => {
  it("reads a Bangla CSV saved by Excel (with the UTF-8 marker)", async () => {
    const csv = "\ufeffname_en,name_bn,gender,class,section,father_phone\nRakib,রাকিব,MALE,class-8,A,1712345678\n";
    const rows = await parseStudentSheet(Buffer.from(csv, "utf-8"), "students.csv");
    expect(rows[0]).toMatchObject({ name_en: "Rakib", name_bn: "রাকিব", class: "class-8", section: "A", father_phone: "1712345678" });
    expect(normalizeRow(rows[0]!, 1, CTX)).toMatchObject({ valid: true, data: { current_class_id: "c8", current_section_id: "c8a", father_phone: "01712345678" } });
  });

  it("round-trips the Excel template, including numbers Excel stored without the leading zero", async () => {
    const template = await buildImportTemplate({ ...CTX, yearLabel: "2026", institutionName: "Test School" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Students")!;
    const col = (key: string) => IMPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
    sheet.getCell(2, col("name_en")).value = "Tasnim";
    sheet.getCell(2, col("gender")).value = "Female";
    sheet.getCell(2, col("class_section")).value = "Class 9";
    sheet.getCell(2, col("father_phone")).value = 1812345678;
    sheet.getCell(2, col("date_of_birth")).value = new Date(Date.UTC(2012, 2, 15));
    const filled = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await parseStudentSheet(filled, "students.xlsx");
    expect(rows).toHaveLength(1);
    const preview = normalizeRow(rows[0]!, 2, CTX);
    expect(preview.errors).toEqual([]);
    expect(preview.data).toMatchObject({ name_en: "Tasnim", gender: "FEMALE", current_class_id: "c9", father_phone: "01812345678", date_of_birth: "2012-03-15" });
  });

  it("puts class dropdown values and text formats in the template", async () => {
    const template = await buildImportTemplate({ ...CTX, yearLabel: "2026", institutionName: "Test School" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ExcelJS.Buffer);
    const lists = workbook.getWorksheet("Lists")!;
    const values = Array.from({ length: 10 }, (_, i) => lists.getCell(i + 1, 1).value).filter((v): v is string => typeof v === "string");
    expect(values).toEqual(["class_section", "Class 8 - A", "Class 8 - B", "Class 9", "Class 10 - A"]);
    const phoneCol = IMPORT_COLUMNS.findIndex((c) => c.key === "father_phone") + 1;
    expect(workbook.getWorksheet("Students")!.getCell(2, phoneCol).numFmt).toBe("@");
  });
});

describe("normalizeRow", () => {
  it("accepts the dropdown value and older class/section columns", () => {
    expect(normalizeRow(BASE, 1, CTX).data).toMatchObject({ current_class_id: "c8", current_section_id: "c8a" });
    expect(normalizeRow({ ...BASE, class_section: "", class: "8", section: "b" }, 1, CTX).data.current_section_id).toBe("c8b");
  });

  it("explains every problem in plain words", () => {
    const row = normalizeRow({ name_en: "", gender: "boyish", class_section: "Class 12", father_phone: "12345", date_of_birth: "31/02/2012" }, 3, CTX);
    expect(row.valid).toBe(false);
    expect(row.errors).toEqual([
      "Student name (English) is required",
      'Gender "boyish" must be Male, Female or Other',
      expect.stringContaining('Class "Class 12" not found'),
      'Father\'s phone "12345" is not a valid 11-digit number starting with 01',
      'Date of birth "31/02/2012" must be DD/MM/YYYY',
    ]);
  });

  it("requires a valid group for classes that have groups", () => {
    expect(normalizeRow({ ...BASE, class_section: "Class 10 - A" }, 1, CTX).errors[0]).toMatch(/has groups — choose one \(SCI, ARTS\)/);
    expect(normalizeRow({ ...BASE, class_section: "Class 10 - A", group_code: "SCI" }, 1, CTX).valid).toBe(true);
  });

  it("copies the present address when asked and lists what is still missing", () => {
    const row = normalizeRow(
      {
        ...BASE,
        present_house_name: "House 1",
        present_village: "Agrabad",
        present_post_code: "4100",
        present_district: "chattogram",
        present_division: "Chattogram",
        permanent_same: "Yes",
      },
      1,
      CTX,
    );
    expect(row.data).toMatchObject({ permanent_village: "Agrabad", present_district: "Chattogram", permanent_district: "Chattogram" });
    expect(row.missing).toContain("Mother's NID");
    expect(row.missing).not.toContain("Permanent address: village");
    expect(row.missing).not.toContain("Photo");
  });

  it("accepts Bangla gender words and digits", () => {
    const row = normalizeRow({ ...BASE, gender: "ছাত্রী", roll: "১২", father_phone: "০১৭১২৩৪৫৬৭৮" }, 1, CTX);
    expect(row.data).toMatchObject({ gender: "FEMALE", current_roll_no: "12", father_phone: "01712345678" });
  });
});

describe("parseImportDate", () => {
  it.each([
    ["15/03/2012", "2012-03-15"],
    ["5-3-2012", "2012-03-05"],
    ["2012-03-15", "2012-03-15"],
    ["১৫/০৩/২০১২", "2012-03-15"],
    ["40983", "2012-03-15"],
  ])("parses %s", (raw, iso) => expect(parseImportDate(raw)).toBe(iso));

  it.each(["31/02/2012", "03/15/2012", "15/03/12", "yesterday"])("rejects %s", (raw) => expect(parseImportDate(raw)).toBeNull());
});
