import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { missingStudentProfileFields } from "@education-erp/validators";
import { normalizeBdPhone } from "../../utils/bd-phone";
import { resolveClassRef, resolveSectionRef, type ClassRef } from "../../utils/class-ref.resolver";

// ── Column catalog (template, parser and instructions all come from this) ──

type ListName = "class_section" | "gender" | "group" | "religion" | "blood_group" | "division" | "district" | "yes_no";

interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  width: number;
  kind?: "text" | "phone" | "date";
  list?: ListName;
  note: string;
  example: string;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name_en", label: "Student name (English)", required: true, width: 26, note: "Full name in English", example: "Md. Rakib Hasan" },
  { key: "name_bn", label: "Student name (Bangla)", width: 24, note: "Optional", example: "মো. রাকিব হাসান" },
  { key: "gender", label: "Gender", required: true, width: 10, list: "gender", note: "Male, Female or Other", example: "Male" },
  { key: "class_section", label: "Class & section", required: true, width: 18, list: "class_section", note: "Pick from the list", example: "Class 8 - A" },
  { key: "group_code", label: "Group", width: 10, list: "group", note: "Only for classes with groups (e.g. Science)", example: "" },
  { key: "roll", label: "Roll no", width: 8, kind: "text", note: "Optional", example: "12" },
  { key: "date_of_birth", label: "Date of birth (DD/MM/YYYY)", width: 14, kind: "date", note: "Day/month/year", example: "15/03/2012" },
  { key: "religion", label: "Religion", width: 12, list: "religion", note: "Pick from the list", example: "Islam" },
  { key: "blood_group", label: "Blood group", width: 10, list: "blood_group", note: "Optional", example: "B+" },
  { key: "birth_reg_no", label: "Birth registration / NID no", width: 22, kind: "text", note: "Optional", example: "20121512345678901" },
  { key: "phone", label: "Student phone", width: 15, kind: "phone", note: "Optional — gives the student their own portal login", example: "" },
  { key: "father_name", label: "Father's name", width: 22, note: "", example: "Md. Abdul Karim" },
  { key: "father_phone", label: "Father's phone", required: true, width: 15, kind: "phone", note: "11 digits, e.g. 01712345678 — the guardian's portal login is sent here", example: "01712345678" },
  { key: "father_nid", label: "Father's NID", width: 18, kind: "text", note: "", example: "1234567890" },
  { key: "father_occupation", label: "Father's occupation", width: 16, note: "", example: "Business" },
  { key: "mother_name", label: "Mother's name", width: 22, note: "", example: "Mst. Rahima Begum" },
  { key: "mother_phone", label: "Mother's phone", width: 15, kind: "phone", note: "", example: "01812345678" },
  { key: "mother_nid", label: "Mother's NID", width: 18, kind: "text", note: "", example: "9876543210" },
  { key: "mother_occupation", label: "Mother's occupation", width: 16, note: "", example: "Housewife" },
  { key: "present_house_name", label: "Present address: house / road", width: 22, note: "", example: "House 12, Road 4" },
  { key: "present_village", label: "Present address: village / area", width: 20, note: "", example: "Agrabad" },
  { key: "present_post_code", label: "Present address: post code", width: 12, kind: "text", note: "", example: "4100" },
  { key: "present_district", label: "Present address: district", width: 16, list: "district", note: "", example: "Chattogram" },
  { key: "present_division", label: "Present address: division", width: 14, list: "division", note: "", example: "Chattogram" },
  { key: "permanent_same", label: "Permanent address same as present?", width: 14, list: "yes_no", note: "Yes copies the present address", example: "Yes" },
  { key: "permanent_house_name", label: "Permanent address: house / road", width: 22, note: "Leave blank if the answer above is Yes", example: "" },
  { key: "permanent_village", label: "Permanent address: village / area", width: 20, note: "", example: "" },
  { key: "permanent_post_code", label: "Permanent address: post code", width: 12, kind: "text", note: "", example: "" },
  { key: "permanent_district", label: "Permanent address: district", width: 16, list: "district", note: "", example: "" },
  { key: "permanent_division", label: "Permanent address: division", width: 14, list: "division", note: "", example: "" },
  { key: "admission_date", label: "Admission date (DD/MM/YYYY)", width: 14, kind: "date", note: "Blank = today", example: "01/01/2026" },
  { key: "previous_institution", label: "Previous school", width: 22, note: "Optional", example: "" },
];

// Older CSV templates used these column names.
const LEGACY_HEADERS: Record<string, string> = {
  class: "class",
  current_class_id: "class",
  section: "section",
  current_section_id: "section",
  current_roll_no: "roll",
  roll_no: "roll",
  nid_or_birth_reg: "birth_reg_no",
};

const RELIGIONS = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const DIVISIONS = ["Barishal", "Chattogram", "Dhaka", "Khulna", "Mymensingh", "Rajshahi", "Rangpur", "Sylhet"];
const DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura", "Brahmanbaria", "Chandpur", "Chapainawabganj", "Chattogram",
  "Chuadanga", "Cox's Bazar", "Cumilla", "Dhaka", "Dinajpur", "Faridpur", "Feni", "Gaibandha", "Gazipur", "Gopalganj", "Habiganj",
  "Jamalpur", "Jashore", "Jhalokati", "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj", "Kurigram", "Kushtia",
  "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura", "Manikganj", "Meherpur", "Moulvibazar", "Munshiganj", "Mymensingh", "Naogaon",
  "Narail", "Narayanganj", "Narsingdi", "Natore", "Netrokona", "Nilphamari", "Noakhali", "Pabna", "Panchagarh", "Patuakhali",
  "Pirojpur", "Rajbari", "Rajshahi", "Rangamati", "Rangpur", "Satkhira", "Shariatpur", "Sherpur", "Sirajganj", "Sunamganj",
  "Sylhet", "Tangail", "Thakurgaon",
];

function headerKey(header: string): string {
  return header
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/\*/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const HEADER_TO_KEY = new Map<string, string>([
  ...IMPORT_COLUMNS.flatMap((c) => [[headerKey(c.label), c.key] as const, [c.key, c.key] as const]),
  ...Object.entries(LEGACY_HEADERS),
]);

export function mapHeader(header: string): string {
  const key = headerKey(header);
  return HEADER_TO_KEY.get(key) ?? key;
}

// ── Parsing ──────────────────────────────────────────────────────────

export type RawRow = Record<string, string>;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel stores dates without a timezone; ExcelJS returns them at UTC midnight.
    return `${String(value.getUTCDate()).padStart(2, "0")}/${String(value.getUTCMonth() + 1).padStart(2, "0")}/${value.getUTCFullYear()}`;
  }
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
}

export async function parseStudentSheet(buffer: Buffer, fileName: string): Promise<RawRow[]> {
  if (/\.xlsx$/i.test(fileName)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Students") ?? workbook.worksheets[0];
    if (!sheet) return [];
    const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) => mapHeader(cellText(v)));
    const rows: RawRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: RawRow = {};
      (row.values as ExcelJS.CellValue[]).forEach((value, col) => {
        const key = headers[col];
        if (key) record[key] = cellText(value).trim();
      });
      if (Object.values(record).some(Boolean)) rows.push(record);
    });
    return rows;
  }
  return parse(buffer.toString("utf-8"), {
    bom: true,
    columns: (header: string[]) => header.map(mapHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as RawRow[];
}

// ── Normalizing one row ──────────────────────────────────────────────

const BN_DIGITS = /[০-৯]/g;
const toAsciiDigits = (s: string) => s.replace(BN_DIGITS, (d) => String(d.charCodeAt(0) - 0x09e6));

// DD/MM/YYYY (also - or .), YYYY-MM-DD, or an Excel day number (a date pasted
// into a text-formatted cell is stored as one, e.g. 40983). Returns ISO YYYY-MM-DD.
export function parseImportDate(raw: string): string | null {
  const s = toAsciiDigits(raw.trim());
  if (/^\d{5}$/.test(s)) {
    const serial = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000);
    return serial.toISOString().slice(0, 10);
  }
  let d: number, m: number, y: number;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseGender(raw: string): "MALE" | "FEMALE" | "OTHER" | null {
  const g = raw.trim().toLowerCase();
  if (["male", "m", "boy", "ছেলে", "পুরুষ", "ছাত্র"].includes(g)) return "MALE";
  if (["female", "f", "girl", "মেয়ে", "মহিলা", "ছাত্রী"].includes(g)) return "FEMALE";
  if (["other", "o", "অন্যান্য"].includes(g)) return "OTHER";
  return null;
}

function canonical(raw: string, options: string[]): string {
  const hit = options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
  return hit ?? raw.trim();
}

export function classSectionLabel(className: string, sectionName?: string | null): string {
  return sectionName ? `${className} - ${sectionName}` : className;
}

export interface ImportContext {
  classes: ClassRef[];
  groupsByClass: Map<string, Set<string>>;
}

export interface ImportedStudent {
  name_en: string;
  name_bn?: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  current_class_id: string;
  current_section_id?: string;
  group_code?: string;
  current_roll_no?: string;
  date_of_birth?: string;
  religion?: string;
  blood_group?: string;
  nid_or_birth_reg?: string;
  phone?: string;
  father_name?: string;
  father_phone: string;
  father_nid?: string;
  father_occupation?: string;
  mother_name?: string;
  mother_phone?: string;
  mother_nid?: string;
  mother_occupation?: string;
  present_house_name?: string;
  present_village?: string;
  present_post_code?: string;
  present_district?: string;
  present_division?: string;
  permanent_house_name?: string;
  permanent_village?: string;
  permanent_post_code?: string;
  permanent_district?: string;
  permanent_division?: string;
  admission_date?: string;
  previous_institution?: string;
}

export interface PreviewRow {
  row: number;
  data: Partial<ImportedStudent> & { class_label: string; section_label: string };
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing: string[];
}

const PLAIN_TEXT_FIELDS = [
  "name_bn", "father_name", "father_nid", "father_occupation", "mother_name", "mother_nid", "mother_occupation",
  "present_house_name", "present_village", "present_post_code",
  "permanent_house_name", "permanent_village", "permanent_post_code", "previous_institution",
] as const;

function resolveClassSection(raw: RawRow, ctx: ImportContext) {
  const combined = raw.class_section?.trim();
  if (combined) {
    const exact = ctx.classes.flatMap((c) =>
      c.sections.length ? c.sections.map((s) => ({ cls: c, section: s as ClassRef["sections"][number] | null })) : [{ cls: c, section: null }],
    );
    const hit = exact.find((o) => classSectionLabel(o.cls.name_en, o.section?.name).toLowerCase() === combined.toLowerCase());
    if (hit) return { cls: hit.cls, section: hit.section, error: undefined };
    const cut = combined.lastIndexOf(" - ");
    return resolveSeparately(ctx, cut > 0 ? combined.slice(0, cut) : combined, cut > 0 ? combined.slice(cut + 3) : "");
  }
  return resolveSeparately(ctx, raw.class, raw.section);
}

function resolveSeparately(ctx: ImportContext, classRaw: string | undefined, sectionRaw: string | undefined) {
  const cls = resolveClassRef(ctx.classes, classRaw);
  if (!cls.match) return { cls: undefined, section: undefined, error: cls.error };
  const section = resolveSectionRef(cls.match, sectionRaw);
  return { cls: cls.match, section: section.match, error: section.error };
}

export function normalizeRow(raw: RawRow, rowNumber: number, ctx: ImportContext): PreviewRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: PreviewRow["data"] = { class_label: "", section_label: "" };
  const value = (key: string) => (raw[key] ?? "").trim();

  data.name_en = value("name_en");
  if (!data.name_en) errors.push("Student name (English) is required");

  const gender = parseGender(value("gender"));
  if (gender) data.gender = gender;
  else errors.push(value("gender") ? `Gender "${value("gender")}" must be Male, Female or Other` : "Gender is required");

  const placement = resolveClassSection(raw, ctx);
  if (placement.error) errors.push(placement.error);
  data.class_label = placement.cls?.name_en ?? (value("class_section") || value("class"));
  data.section_label = placement.section?.name ?? (placement.cls ? "" : value("section"));
  if (placement.cls) {
    data.current_class_id = placement.cls.id;
    data.current_section_id = placement.section?.id;
    const groups = ctx.groupsByClass.get(placement.cls.id);
    const group = value("group_code");
    if (groups?.size) {
      if (!group) errors.push(`${placement.cls.name_en} has groups — choose one (${[...groups].join(", ")})`);
      else if (!groups.has(group)) errors.push(`Group "${group}" not found for ${placement.cls.name_en} — use ${[...groups].join(", ")}`);
      else data.group_code = group;
    }
  }

  for (const [key, label, required] of [["father_phone", "Father's phone", true], ["mother_phone", "Mother's phone", false], ["phone", "Student phone", false]] as const) {
    const rawPhone = value(key);
    if (!rawPhone) {
      if (required) errors.push(`${label} is required`);
      continue;
    }
    const phone = normalizeBdPhone(rawPhone);
    if (phone) data[key] = phone;
    else errors.push(`${label} "${rawPhone}" is not a valid 11-digit number starting with 01`);
  }

  for (const [key, label] of [["date_of_birth", "Date of birth"], ["admission_date", "Admission date"]] as const) {
    if (!value(key)) continue;
    const iso = parseImportDate(value(key));
    if (!iso) errors.push(`${label} "${value(key)}" must be DD/MM/YYYY`);
    else if (key === "date_of_birth" && (iso > new Date().toISOString().slice(0, 10) || iso < "1950-01-01")) errors.push(`Date of birth ${value(key)} looks wrong`);
    else data[key] = iso;
  }

  for (const key of PLAIN_TEXT_FIELDS) if (value(key)) data[key] = value(key);
  if (value("roll")) data.current_roll_no = toAsciiDigits(value("roll"));
  if (value("birth_reg_no")) data.nid_or_birth_reg = toAsciiDigits(value("birth_reg_no"));
  if (value("religion")) data.religion = canonical(value("religion"), RELIGIONS);
  if (value("blood_group")) data.blood_group = value("blood_group").toUpperCase().replace(/\s+/g, "");
  for (const prefix of ["present", "permanent"] as const) {
    if (value(`${prefix}_district`)) data[`${prefix}_district`] = canonical(value(`${prefix}_district`), DISTRICTS);
    if (value(`${prefix}_division`)) data[`${prefix}_division`] = canonical(value(`${prefix}_division`), DIVISIONS);
  }
  if (/^(yes|y|হ্যাঁ|হ্যা)$/i.test(value("permanent_same"))) {
    for (const part of ["house_name", "village", "post_code", "district", "division"] as const) {
      data[`permanent_${part}`] ??= data[`present_${part}`];
    }
  }

  // The photo is never in a spreadsheet, so it isn't listed per row.
  const missing = missingStudentProfileFields(data as Record<string, string>).filter((label) => label !== "Photo");
  return { row: rowNumber, data, valid: errors.length === 0, errors, warnings, missing };
}

// ── Template workbook ────────────────────────────────────────────────

// ExcelJS 4.4 has range-wide validations at runtime but its typings omit them;
// one range rule keeps the file small instead of 1,000 per-cell copies.
type WorksheetWithRangeValidation = ExcelJS.Worksheet & { dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void } };

export function buildImportTemplate(ctx: ImportContext & { yearLabel: string; institutionName: string }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = ctx.institutionName;
  const sheet = workbook.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  const guide = workbook.addWorksheet("Instructions");
  const lists = workbook.addWorksheet("Lists", { state: "hidden" });

  const listValues: Record<ListName, string[]> = {
    class_section: ctx.classes.flatMap((c) => (c.sections.length ? c.sections.map((s) => classSectionLabel(c.name_en, s.name)) : [c.name_en])),
    gender: ["Male", "Female", "Other"],
    group: [...new Set([...ctx.groupsByClass.values()].flatMap((g) => [...g]))],
    religion: RELIGIONS,
    blood_group: BLOOD_GROUPS,
    division: DIVISIONS,
    district: DISTRICTS,
    yes_no: ["Yes", "No"],
  };
  const listRange = new Map<ListName, string>();
  (Object.keys(listValues) as ListName[]).forEach((name, i) => {
    const col = i + 1;
    lists.getCell(1, col).value = name;
    listValues[name].forEach((v, r) => (lists.getCell(r + 2, col).value = v));
    const letter = lists.getColumn(col).letter;
    listRange.set(name, `Lists!$${letter}$2:$${letter}$${Math.max(listValues[name].length + 1, 2)}`);
  });

  const LAST_ROW = 1000;
  IMPORT_COLUMNS.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = c.width;
    const header = sheet.getCell(1, i + 1);
    header.value = c.required ? `${c.label} *` : c.label;
    header.font = { name: "Calibri", bold: true, size: 10, color: { argb: c.required ? "FF7C2D12" : "FF334155" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? "FFFDE68A" : "FFE2E8F0" } };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
    if (c.note) header.note = c.note;
    const range = `${column.letter}2:${column.letter}${LAST_ROW}`;
    // Text format keeps leading zeros (phones, NIDs, post codes) and stops Excel from re-reading dates in US order.
    if (c.kind) for (let r = 2; r <= LAST_ROW; r++) sheet.getCell(r, i + 1).numFmt = "@";
    if (c.list && listValues[c.list].length) {
      const strict = c.list !== "district";
      (sheet as WorksheetWithRangeValidation).dataValidations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [listRange.get(c.list)!],
        showErrorMessage: true,
        errorStyle: strict ? "stop" : "warning",
        errorTitle: c.label,
        error: strict ? "Please pick a value from the list." : "This district isn't in the list — keep it anyway?",
      });
    }
  });
  sheet.getRow(1).height = 42;

  guide.columns = [{ width: 34 }, { width: 11 }, { width: 58 }, { width: 22 }];
  guide.addRow([`${ctx.institutionName} — student import template`]).font = { bold: true, size: 14 };
  guide.addRow([`Academic year: ${ctx.yearLabel}. The class list is for this year only.`]);
  guide.addRow(["Fill one student per row on the Students sheet. Yellow columns are required; grey ones are optional but complete the profile."]);
  guide.addRow(["Students imported with missing details are marked 'Incomplete' and can be finished later from their Edit page. Photos are added later."]);
  guide.addRow([]);
  const head = guide.addRow(["Column", "Required", "What to enter", "Example"]);
  head.font = { bold: true };
  head.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }));
  for (const c of IMPORT_COLUMNS) {
    const row = guide.addRow([c.label, c.required ? "Yes" : "", c.list ? `${c.note || "Pick from the list"}`.trim() : c.note, c.example]);
    row.alignment = { wrapText: true, vertical: "top" };
  }

  return workbook.xlsx.writeBuffer().then((b) => Buffer.from(b));
}
