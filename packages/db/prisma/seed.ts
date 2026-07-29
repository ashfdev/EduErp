import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

// A small placeholder institution logo, embedded as a data URI rather than
// uploaded through server/api's storage pipeline -- packages/db has no
// dependency on server/api (and seed data isn't routed through the real
// API at all, per this file's own existing convention for e.g. Invoice's
// invoice_no), so this is the only reproducible way to seed a real logo_url
// value on a fresh install. A data: URI also needs no file-serving
// infrastructure at all (no local-uploads dependency, no CORP/CORS
// concerns), so it renders identically whether or not Azure Blob Storage
// is ever configured.
const PLACEHOLDER_LOGO_DATA_URI = `data:image/png;base64,${readFileSync(join(__dirname, "seed-assets", "logo.b64.txt"), "utf-8").trim()}`;

// Deterministic placeholder photography for demo content — picsum.photos
// returns the same image for the same seed key every time, so re-running
// this script (or just reloading the site) never causes photos to shuffle.
// apps/website/next.config.mjs allowlists picsum.photos in image
// remotePatterns specifically so these render via next/image in local dev;
// a real institution replaces every one of these via admin uploads.
function picsum(key: string, width: number, height: number): string {
  return `https://picsum.photos/seed/${key}/${width}/${height}`;
}
function pravatar(key: string, size: number): string {
  return `https://i.pravatar.cc/${size}?u=${key}`;
}

const BD_BOARD_RANGES = [
  { min_marks: 80, max_marks: 100, grade_letter: "A+", grade_point: 5.0, remarks: "Excellent", display_order: 1 },
  { min_marks: 70, max_marks: 79.99, grade_letter: "A", grade_point: 4.0, remarks: "Very Good", display_order: 2 },
  { min_marks: 60, max_marks: 69.99, grade_letter: "A-", grade_point: 3.5, remarks: "Good", display_order: 3 },
  { min_marks: 50, max_marks: 59.99, grade_letter: "B", grade_point: 3.0, remarks: "Above Average", display_order: 4 },
  { min_marks: 40, max_marks: 49.99, grade_letter: "C", grade_point: 2.0, remarks: "Average", display_order: 5 },
  { min_marks: 33, max_marks: 39.99, grade_letter: "D", grade_point: 1.0, remarks: "Pass", display_order: 6 },
  { min_marks: 0, max_marks: 32.99, grade_letter: "F", grade_point: 0.0, remarks: "Fail", display_order: 7 },
];

// Small inline mirror of the real grading engine's range lookup (packages/db
// has no dependency on server/api, so this isn't imported) -- used only to
// derive a plausible grade_letter/grade_point for seeded demo MarkEntry
// rows from BD_BOARD_RANGES above.
function gradeFor(marks: number): { grade_letter: string; grade_point: number } {
  const range = BD_BOARD_RANGES.find((r) => marks >= r.min_marks && marks <= r.max_marks) ?? BD_BOARD_RANGES[BD_BOARD_RANGES.length - 1]!;
  return { grade_letter: range.grade_letter, grade_point: range.grade_point };
}

const ACCOUNT_GROUPS = [
  { id: "grp-assets", name: "Assets", type: "ASSET" as const, display_order: 1 },
  { id: "grp-liabilities", name: "Liabilities", type: "LIABILITY" as const, display_order: 2 },
  { id: "grp-equity", name: "Equity", type: "EQUITY" as const, display_order: 3 },
  { id: "grp-income", name: "Income", type: "INCOME" as const, display_order: 4 },
  { id: "grp-expenses", name: "Expenses", type: "EXPENSE" as const, display_order: 5 },
];

// account_nature defaults to the group's normal nature; Accumulated
// Depreciation (1105) is the one deliberate exception — a contra-asset
// account that carries a credit balance despite living in the Assets group.
const CHART_OF_ACCOUNTS: { code: string; name: string; group: string; is_system?: boolean; is_cash?: boolean; is_bank?: boolean; nature?: "DEBIT_NORMAL" | "CREDIT_NORMAL" }[] = [
  { code: "1001", name: "Cash in Hand", group: "grp-assets", is_system: true, is_cash: true },
  { code: "1002", name: "Cash at Bank", group: "grp-assets", is_system: true, is_bank: true },
  { code: "1003", name: "Accounts Receivable", group: "grp-assets", is_system: true },
  { code: "1004", name: "Advance to Staff", group: "grp-assets" },
  { code: "1005", name: "Advance to Suppliers", group: "grp-assets" },
  { code: "1006", name: "Security Deposits", group: "grp-assets" },
  { code: "1007", name: "Prepaid Expenses", group: "grp-assets" },
  { code: "1101", name: "Fixed Assets (Furniture)", group: "grp-assets" },
  { code: "1102", name: "Fixed Assets (Electronics & Equipment)", group: "grp-assets" },
  { code: "1103", name: "Fixed Assets (Vehicles)", group: "grp-assets" },
  { code: "1104", name: "Fixed Assets (Buildings)", group: "grp-assets" },
  { code: "1105", name: "Accumulated Depreciation", group: "grp-assets", nature: "CREDIT_NORMAL" },

  { code: "2001", name: "Accounts Payable", group: "grp-liabilities" },
  { code: "2002", name: "TDS Payable", group: "grp-liabilities", is_system: true },
  { code: "2003", name: "VAT Payable", group: "grp-liabilities", is_system: true },
  { code: "2004", name: "Salary Payable", group: "grp-liabilities", is_system: true },
  { code: "2005", name: "Advance Fees Received", group: "grp-liabilities" },
  { code: "2006", name: "Security Deposits Received", group: "grp-liabilities" },
  { code: "2007", name: "Bank Loan", group: "grp-liabilities" },

  { code: "3001", name: "Institutional Fund", group: "grp-equity" },
  { code: "3002", name: "Reserve Fund", group: "grp-equity" },
  { code: "3003", name: "Development Fund", group: "grp-equity" },
  { code: "3004", name: "Surplus/Deficit", group: "grp-equity", is_system: true },

  { code: "4001", name: "Tuition Fee Income", group: "grp-income", is_system: true },
  { code: "4002", name: "Admission Fee Income", group: "grp-income", is_system: true },
  { code: "4003", name: "Exam Fee Income", group: "grp-income", is_system: true },
  { code: "4004", name: "Transport Fee Income", group: "grp-income" },
  { code: "4005", name: "Hostel Fee Income", group: "grp-income" },
  { code: "4006", name: "Lab Fee Income", group: "grp-income" },
  { code: "4007", name: "Library Fee Income", group: "grp-income" },
  { code: "4008", name: "Development Fee Income", group: "grp-income" },
  { code: "4009", name: "Late Fine Income", group: "grp-income" },
  { code: "4010", name: "Bank Interest Income", group: "grp-income" },
  { code: "4011", name: "Other Income", group: "grp-income" },
  { code: "4012", name: "Government Grant", group: "grp-income" },
  { code: "4013", name: "Readmission Fee Income", group: "grp-income" },
  { code: "4014", name: "Form Fee Income", group: "grp-income" },

  { code: "5001", name: "Salary Expense — Teaching Staff", group: "grp-expenses", is_system: true },
  { code: "5002", name: "Salary Expense — Non-Teaching Staff", group: "grp-expenses", is_system: true },
  { code: "5003", name: "Allowances & Benefits", group: "grp-expenses" },
  { code: "5004", name: "PF Contribution (Employer)", group: "grp-expenses" },
  { code: "5005", name: "Utility Bills (Electricity)", group: "grp-expenses" },
  { code: "5006", name: "Utility Bills (Water & Gas)", group: "grp-expenses" },
  { code: "5007", name: "Telephone & Internet", group: "grp-expenses" },
  { code: "5008", name: "Rent & Rates", group: "grp-expenses" },
  { code: "5009", name: "Stationery & Office Supplies", group: "grp-expenses" },
  { code: "5010", name: "Printing & Publications", group: "grp-expenses" },
  { code: "5011", name: "Repairs & Maintenance", group: "grp-expenses" },
  { code: "5012", name: "Lab Supplies & Chemicals", group: "grp-expenses" },
  { code: "5013", name: "Sports & Co-Curricular", group: "grp-expenses" },
  { code: "5014", name: "Transport Expense", group: "grp-expenses" },
  { code: "5015", name: "Bank Charges", group: "grp-expenses" },
  { code: "5016", name: "Advertisement & Promotion", group: "grp-expenses" },
  { code: "5017", name: "Audit & Professional Fees", group: "grp-expenses" },
  { code: "5018", name: "Depreciation Expense", group: "grp-expenses", is_system: true },
  { code: "5019", name: "Miscellaneous Expense", group: "grp-expenses" },
  { code: "5020", name: "Loss on Disposal of Asset", group: "grp-expenses" },
  { code: "5021", name: "Scholarship & Waiver Expense", group: "grp-expenses", is_system: true },
];

const FEE_CATEGORY_TO_ACCOUNT_CODE: Record<string, string> = {
  TUITION: "4001",
  ADMISSION: "4002",
  EXAM: "4003",
  TRANSPORT: "4004",
  HOSTEL: "4005",
  LAB: "4006",
  LIBRARY: "4007",
  DEVELOPMENT: "4008",
  SPORTS: "4011",
  OTHER: "4011",
  FORM: "4014",
  READMISSION: "4013",
};

const NOTIFICATION_TRIGGERS = ["ABSENCE", "LATE", "FEE_DUE", "RESULT_PUBLISHED", "NOTICE", "ADMISSION_CONFIRM", "PORTAL_LOGIN_CREATED", "EXAM_SCHEDULED"] as const;
const NOTIFICATION_CHANNELS = ["SMS", "EMAIL", "PUSH"] as const;

const NOTIFICATION_TEMPLATES: Record<(typeof NOTIFICATION_TRIGGERS)[number], { bn: string; en: string }> = {
  ABSENCE: {
    bn: "প্রিয় অভিভাবক, আজ {{date}} তারিখে {{student_name}} উপস্থিত নেই। যোগাযোগ করুন: {{school_phone}}",
    en: "Dear guardian, {{student_name}} was absent today ({{date}}). Contact: {{school_phone}}",
  },
  LATE: {
    bn: "প্রিয় অভিভাবক, {{student_name}} আজ {{time}} সময়ে বিদ্যালয়ে দেরিতে উপস্থিত হয়েছে।",
    en: "Dear guardian, {{student_name}} arrived late today at {{time}}.",
  },
  FEE_DUE: {
    bn: "{{student_name}} এর {{month}} মাসের বেতন বকেয়া আছে। মোট: ৳{{amount}}। দিন: {{school_name}}",
    en: "{{student_name}}'s fee for {{month}} is due. Total: BDT {{amount}}. — {{school_name}}",
  },
  RESULT_PUBLISHED: {
    bn: "{{student_name}} এর {{exam_name}} ফলাফল প্রকাশিত হয়েছে। GPA: {{gpa}}। পোর্টালে দেখুন।",
    en: "{{student_name}}'s result for {{exam_name}} has been published. GPA: {{gpa}}. View on the portal.",
  },
  NOTICE: {
    bn: "{{title}}: {{body}}",
    en: "{{title}}: {{body}}",
  },
  ADMISSION_CONFIRM: {
    bn: "অভিনন্দন! {{student_name}} ভর্তি নিশ্চিত হয়েছে। শিক্ষার্থী আইডি: {{student_uid}}",
    en: "Congratulations! {{student_name}} has been admitted. Student ID: {{student_uid}}",
  },
  PORTAL_LOGIN_CREATED: {
    bn: "{{name}}, আপনার পোর্টাল অ্যাকাউন্ট তৈরি হয়েছে। ফোন: {{phone}}, অস্থায়ী পাসওয়ার্ড: {{password}}। {{portal_url}} এ লগইন করুন।",
    en: "{{name}}, your portal account has been created. Phone: {{phone}}, temporary password: {{password}}. Log in at {{portal_url}}.",
  },
  EXAM_SCHEDULED: {
    bn: "{{student_name}} এর জন্য {{exam_name}} পরীক্ষা {{start_date}} তারিখে শুরু হবে। প্রস্তুতি নিন।",
    en: "{{exam_name}} for {{student_name}} starts on {{start_date}}. Please prepare accordingly.",
  },
};

const SCHOOL_SUBJECTS = [
  { code: "BAN1", name_en: "Bangla 1st Paper", is_optional: false },
  { code: "BAN2", name_en: "Bangla 2nd Paper", is_optional: false },
  { code: "ENG1", name_en: "English 1st Paper", is_optional: false },
  { code: "ENG2", name_en: "English 2nd Paper", is_optional: false },
  { code: "MATH", name_en: "Mathematics", is_optional: false },
  { code: "PHY", name_en: "Physics", is_optional: false },
  { code: "CHEM", name_en: "Chemistry", is_optional: false },
  { code: "BIO", name_en: "Biology", is_optional: true },
  { code: "HMATH", name_en: "Higher Mathematics", is_optional: true },
  { code: "ICT", name_en: "ICT", is_optional: false },
  { code: "BGS", name_en: "Bangladesh & Global Studies", is_optional: false },
  { code: "REL", name_en: "Religion", is_optional: false },
];

const DEMO_STUDENTS = [
  { name_en: "Md. Rakib Hasan", name_bn: "মো. রাকিব হাসান", gender: "MALE" as const, father_phone: "01811100001" },
  { name_en: "Tasnim Akter", name_bn: "তাসনিম আক্তার", gender: "FEMALE" as const, father_phone: "01811100002" },
  { name_en: "Md. Shakil Ahmed", name_bn: "মো. শাকিল আহমেদ", gender: "MALE" as const, father_phone: "01811100003" },
  { name_en: "Nusrat Jahan", name_bn: "নুসরাত জাহান", gender: "FEMALE" as const, father_phone: "01811100004" },
  { name_en: "Md. Imran Kabir", name_bn: "মো. ইমরান কবির", gender: "MALE" as const, father_phone: "01811100005" },
];

async function main() {
  const INSTITUTION_PROFILE_CONTENT = {
    address: "Agrabad Access Road, Double Mooring, Chattogram, Bangladesh",
    phone_primary: "+8801711223344",
    email_primary: "info@alhumairaschool.edu.bd",
    facebook_url: "https://facebook.com/alhumairaschool",
    youtube_url: "https://youtube.com/@alhumairaschool",
    founded_year: 2010,
    established_text:
      "Established in 2010, Alhumaira Model School & College has served the Chattogram community for over a decade with a blend of academic rigor and moral education.",
    mission_text:
      "To provide quality, values-based education that nurtures every student's intellectual, moral, and physical development, preparing them to be responsible citizens and lifelong learners.",
    vision_text:
      "To be a leading center of academic and moral excellence, producing graduates who lead with knowledge, integrity, and compassion.",
    principal_name: "Mohammad Aminul Islam",
    principal_designation: "Principal",
  };
  await prisma.institutionProfile.upsert({
    where: { id: "singleton" },
    // `type` is deliberately excluded from `update` — the live institution's
    // type was changed to MADRASAH via the admin panel after this seed's
    // original SCHOOL default, and reseeding must never clobber an
    // admin-made change back to the seed's initial value. Same reasoning
    // for eiin/name_en/board/primary_color, which the seed never revises.
    update: INSTITUTION_PROFILE_CONTENT,
    create: {
      id: "singleton",
      name_en: "Alhumaira Model School & College",
      name_bn: "আলহুমাইরা মডেল স্কুল অ্যান্ড কলেজ",
      type: "SCHOOL",
      eiin: "123456",
      board: "Chittagong",
      primary_color: "#1a3c4a",
      // Same "never clobber an admin's real value on reseed" reasoning as
      // the fields above — a real institution's uploaded logo must survive
      // a reseed untouched, so this is create-only too.
      logo_url: PLACEHOLDER_LOGO_DATA_URI,
      ...INSTITUTION_PROFILE_CONTENT,
    },
  });

  await prisma.institutionConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  await prisma.studentIdConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      prefix: "ALh",
      include_year: true,
      year_format: "2",
      include_month: false,
      separator: "-",
      sequence_digits: 4,
      preview_example: "ALh-26-0001",
    },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { label: "2026-2027" },
    update: {},
    create: { label: "2026-2027", start_date: new Date("2026-01-01"), end_date: new Date("2026-12-31"), is_active: true },
  });

  const morningShift = await prisma.shift.upsert({
    where: { id: "shift-morning" },
    update: {},
    create: { id: "shift-morning", name: "Morning", start_time: "07:30", end_time: "12:30" },
  });
  const dayShift = await prisma.shift.upsert({
    where: { id: "shift-day" },
    update: {},
    create: { id: "shift-day", name: "Day", start_time: "12:30", end_time: "17:30" },
  });

  // Previously a fresh install had zero ShiftPeriod rows for any Shift —
  // clicking "Generate Routine" for the first time silently produced no
  // slots at all until an admin discovered they had to configure this
  // first, with no onboarding prompt telling them so. Seeding a real
  // default set (matching a typical BD school day) closes that gap.
  const SHIFT_PERIOD_DEFAULTS: Record<string, { period_no: number; start_time: string; end_time: string; is_break: boolean }[]> = {
    "shift-morning": [
      { period_no: 1, start_time: "07:30", end_time: "08:15", is_break: false },
      { period_no: 2, start_time: "08:15", end_time: "09:00", is_break: false },
      { period_no: 3, start_time: "09:00", end_time: "09:45", is_break: false },
      { period_no: 4, start_time: "09:45", end_time: "10:00", is_break: true },
      { period_no: 5, start_time: "10:00", end_time: "10:45", is_break: false },
      { period_no: 6, start_time: "10:45", end_time: "11:30", is_break: false },
      { period_no: 7, start_time: "11:30", end_time: "12:15", is_break: false },
    ],
    "shift-day": [
      { period_no: 1, start_time: "12:30", end_time: "13:15", is_break: false },
      { period_no: 2, start_time: "13:15", end_time: "14:00", is_break: false },
      { period_no: 3, start_time: "14:00", end_time: "14:45", is_break: false },
      { period_no: 4, start_time: "14:45", end_time: "15:00", is_break: true },
      { period_no: 5, start_time: "15:00", end_time: "15:45", is_break: false },
      { period_no: 6, start_time: "15:45", end_time: "16:30", is_break: false },
      { period_no: 7, start_time: "16:30", end_time: "17:15", is_break: false },
    ],
  };
  for (const [shiftId, periods] of Object.entries(SHIFT_PERIOD_DEFAULTS)) {
    for (const p of periods) {
      await prisma.shiftPeriod.upsert({
        where: { shift_id_period_no: { shift_id: shiftId, period_no: p.period_no } },
        update: {},
        create: { shift_id: shiftId, period_no: p.period_no, start_time: p.start_time, end_time: p.end_time, is_break: p.is_break },
      });
    }
  }

  const classes: Record<number, { id: string }> = {};
  for (const level of [6, 7, 8, 9, 10]) {
    const cls = await prisma.class.upsert({
      where: { id: `class-${level}` },
      update: {},
      create: { id: `class-${level}`, academic_year_id: academicYear.id, name_en: `Class ${level}`, numeric_level: level },
    });
    classes[level] = cls;
    for (const sectionName of ["A", "B"]) {
      await prisma.section.upsert({
        where: { id: `class-${level}-${sectionName}` },
        update: {},
        create: { id: `class-${level}-${sectionName}`, class_id: cls.id, shift_id: morningShift.id, name: sectionName },
      });
    }
  }
  // Reference the day shift too, even though every demo section uses
  // Morning — keeps the seeded data from silently leaving it unused.
  void dayShift;

  const classNineTenSubjects: Record<string, string[]> = {};
  for (const level of [9, 10]) {
    const cls = classes[level];
    const subjectIds: string[] = [];
    for (const [index, s] of SCHOOL_SUBJECTS.entries()) {
      const subject = await prisma.subject.upsert({
        where: { id: `subject-${level}-${s.code}` },
        update: {},
        create: {
          id: `subject-${level}-${s.code}`,
          class_id: cls.id,
          name_en: s.name_en,
          code: s.code,
          is_compulsory: !s.is_optional,
          is_optional: s.is_optional,
          display_order: index,
        },
      });
      subjectIds.push(subject.id);
    }
    classNineTenSubjects[level] = subjectIds;
  }

  const gradingScale = await prisma.gradingScale.upsert({
    where: { id: "bd-board-standard" },
    update: {},
    create: {
      id: "bd-board-standard",
      name: "BD Board Standard",
      is_default: true,
      scale_type: "GPA_5",
    },
  });

  for (const range of BD_BOARD_RANGES) {
    await prisma.gradeRange.upsert({
      where: { id: `${gradingScale.id}-${range.grade_letter}` },
      update: {},
      create: { id: `${gradingScale.id}-${range.grade_letter}`, grading_scale_id: gradingScale.id, ...range },
    });
  }

  await prisma.attendanceRules.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  await prisma.feeRules.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  await prisma.marksheetDisplaySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // ── Phase 8B: Chart of Accounts + active Financial Year ──
  for (const group of ACCOUNT_GROUPS) {
    await prisma.accountGroup.upsert({ where: { id: group.id }, update: {}, create: group });
  }
  const accountIdByCode: Record<string, string> = {};
  for (const acc of CHART_OF_ACCOUNTS) {
    const isAssetGroup = acc.group === "grp-assets";
    const isLiabOrEquity = acc.group === "grp-liabilities" || acc.group === "grp-equity";
    const defaultNature = isAssetGroup ? "DEBIT_NORMAL" : isLiabOrEquity || acc.group === "grp-income" ? "CREDIT_NORMAL" : "DEBIT_NORMAL";
    const account = await prisma.account.upsert({
      where: { code: acc.code },
      update: {},
      create: {
        account_group_id: acc.group,
        code: acc.code,
        name: acc.name,
        account_nature: acc.nature ?? defaultNature,
        is_system: acc.is_system ?? false,
        is_cash_account: acc.is_cash ?? false,
        is_bank_account: acc.is_bank ?? false,
      },
    });
    accountIdByCode[acc.code] = account.id;
  }

  const activeFinancialYear = await prisma.financialYear.upsert({
    where: { label: "2026-2027" },
    update: {},
    create: { label: "2026-2027", start_date: new Date("2026-01-01"), end_date: new Date("2026-12-31"), is_active: true },
  });

  for (const [category, code] of Object.entries(FEE_CATEGORY_TO_ACCOUNT_CODE)) {
    await prisma.feeAccountMapping.upsert({
      where: { category: category as never },
      update: {},
      create: { category: category as never, account_id: accountIdByCode[code]! },
    });
  }

  // Starter FeeStructure rows so a fresh install has something to invoice
  // against out of the box — confirmed via audit that zero FeeStructure
  // rows existed anywhere before this. Amounts (BDT) are representative
  // placeholders, not real institution figures — an admin reviews/adjusts
  // them via Settings → Fee Rules before going live.
  const TUITION_BY_LEVEL: Record<number, number> = { 6: 700, 7: 750, 8: 800, 9: 900, 10: 1000 };
  for (const level of [6, 7, 8, 9, 10]) {
    const cls = classes[level];
    await prisma.feeStructure.upsert({
      where: { id: `fee-tuition-${level}` },
      update: {},
      create: {
        id: `fee-tuition-${level}`,
        academic_year_id: academicYear.id,
        class_id: cls.id,
        category: "TUITION",
        name: `Class ${level} Monthly Tuition`,
        amount: TUITION_BY_LEVEL[level]!,
        frequency: "MONTHLY",
        due_day: 10,
      },
    });
    await prisma.feeStructure.upsert({
      where: { id: `fee-admission-${level}` },
      update: {},
      create: {
        id: `fee-admission-${level}`,
        academic_year_id: academicYear.id,
        class_id: cls.id,
        category: "ADMISSION",
        name: `Class ${level} Admission Fee`,
        amount: 3000,
        frequency: "ONE_TIME",
      },
    });
    await prisma.feeStructure.upsert({
      where: { id: `fee-exam-${level}` },
      update: {},
      create: {
        id: `fee-exam-${level}`,
        academic_year_id: academicYear.id,
        class_id: cls.id,
        category: "EXAM",
        name: `Class ${level} Exam Fee`,
        amount: 300,
        frequency: "ONE_TIME",
      },
    });
  }

  // Default asset categories linked to the chart of accounts, so
  // depreciation/purchase auto-journals have somewhere to post from day one.
  const assetCategoryDefs = [
    { id: "asset-cat-furniture", name: "Furniture", rate: 10, life: 10, assetCode: "1101" },
    { id: "asset-cat-electronics", name: "Electronics & Equipment", rate: 20, life: 5, assetCode: "1102" },
    { id: "asset-cat-vehicles", name: "Vehicles", rate: 15, life: 7, assetCode: "1103" },
    { id: "asset-cat-buildings", name: "Buildings", rate: 5, life: 20, assetCode: "1104" },
  ];
  for (const cat of assetCategoryDefs) {
    await prisma.assetCategory.upsert({
      where: { id: cat.id },
      update: {},
      create: {
        id: cat.id,
        name: cat.name,
        depreciation_rate: cat.rate,
        useful_life_years: cat.life,
        asset_account_id: accountIdByCode[cat.assetCode],
        accumulated_dep_account_id: accountIdByCode["1105"],
        dep_expense_account_id: accountIdByCode["5018"],
      },
    });
  }

  const itemCategoryDefs = [
    { id: "item-cat-stationery", name: "Stationery" },
    { id: "item-cat-lab-chemicals", name: "Lab Chemicals" },
    { id: "item-cat-cleaning", name: "Cleaning Supplies" },
  ];
  for (const cat of itemCategoryDefs) {
    await prisma.itemCategory.upsert({ where: { id: cat.id }, update: {}, create: { id: cat.id, name: cat.name } });
  }

  for (const trigger of NOTIFICATION_TRIGGERS) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const template = NOTIFICATION_TEMPLATES[trigger];
      await prisma.notificationConfig.upsert({
        where: { trigger_channel: { trigger, channel } },
        update: {},
        create: {
          trigger,
          channel,
          is_enabled: channel === "SMS",
          template_bn: template.bn,
          template_en: template.en,
        },
      });
    }
  }

  const passwordHash = await bcrypt.hash("Admin@1234", 10);
  await prisma.user.upsert({
    where: { phone: "01700000000" },
    update: {},
    create: {
      name_en: "System Admin",
      role: "ADMIN",
      phone: "01700000000",
      password_hash: passwordHash,
    },
  });

  const staffPasswordHash = await bcrypt.hash("Test@1234", 10);
  // Public /faculty vs /staff split is derived from User.role at query time
  // (TEACHING_ROLES = CLASS_TEACHER/SUBJECT_TEACHER/HEAD_OF_DEPT → Faculty,
  // everything else → Staff — see server/api/src/lib/roles.ts), so the mix
  // of roles below is what actually determines which directory each person
  // shows up in, not any field on Staff itself. `show_on_website: true` is
  // required on top of that for a Staff row to appear publicly at all.
  const demoStaffUsers = [
    {
      phone: "01700000001", name_en: "Mohammad Aminul Islam", name_bn: "মোহাম্মদ আমিনুল ইসলাম", role: "PRINCIPAL" as const,
      designation: "Principal", photo_key: "staff-principal",
      qualifications: "M.A. in Islamic Studies, University of Chittagong; B.Ed.",
      achievements: "Recipient of the District Best Headteacher Award, 2022.",
      public_contact_email: "principal@alhumairaschool.edu.bd",
      public_office_location: "Admin Building, Room 101",
      publications: null as { title: string; url: string }[] | null,
    },
    {
      phone: "01700000002", name_en: "Shahida Begum", name_bn: "শাহিদা বেগম", role: "EXAM_CONTROLLER" as const,
      designation: "Exam Controller", photo_key: "staff-exam-controller",
      qualifications: "M.Sc. in Mathematics, University of Chittagong",
      achievements: null as string | null,
      public_contact_email: "examcontroller@alhumairaschool.edu.bd",
      public_office_location: "Admin Building, Room 104",
      publications: null as { title: string; url: string }[] | null,
    },
    {
      phone: "01700000003", name_en: "Kamrul Hasan", name_bn: "কামরুল হাসান", role: "ACCOUNTANT" as const,
      designation: "Accountant", photo_key: "staff-accountant",
      qualifications: "B.Com (Hons), M.Com in Accounting, University of Chittagong",
      achievements: null as string | null,
      public_contact_email: "accounts@alhumairaschool.edu.bd",
      public_office_location: "Admin Building, Room 106",
      publications: null as { title: string; url: string }[] | null,
    },
    {
      phone: "01700000004", name_en: "Nasrin Sultana", name_bn: "নাসরিন সুলতানা", role: "CLASS_TEACHER" as const,
      designation: "Senior Class Teacher, Class 9", photo_key: "staff-class-teacher-1",
      qualifications: "M.A. in Bangla Literature, B.Ed.",
      achievements: "Best Class Teacher Award, 2024.",
      public_contact_email: "nasrin.sultana@alhumairaschool.edu.bd",
      public_office_location: "Academic Building, Staff Room 2",
      publications: [{ title: "Teaching Bangla Grammar Effectively", url: "https://example.com/articles/bangla-grammar" }],
    },
    {
      phone: "01700000005", name_en: "Md. Tarequl Islam", name_bn: "মোঃ তারেকুল ইসলাম", role: "SUBJECT_TEACHER" as const,
      designation: "Senior Subject Teacher, English", photo_key: "staff-subject-teacher-1",
      qualifications: "M.A. in English Literature, University of Dhaka",
      achievements: null as string | null,
      public_contact_email: "tarequl.islam@alhumairaschool.edu.bd",
      public_office_location: "Academic Building, Staff Room 3",
      publications: null as { title: string; url: string }[] | null,
    },
    {
      phone: "01700000006", name_en: "Farida Yasmin", name_bn: "ফরিদা ইয়াসমিন", role: "HEAD_OF_DEPT" as const,
      designation: "Head of Department, Science", photo_key: "staff-head-of-dept",
      qualifications: "M.Sc. in Physics, Bangladesh University of Engineering and Technology",
      achievements: "Published researcher in secondary science pedagogy.",
      public_contact_email: "farida.yasmin@alhumairaschool.edu.bd",
      public_office_location: "Science Building, Room 12",
      publications: [{ title: "Hands-on Physics for Secondary Students", url: "https://example.com/articles/hands-on-physics" }],
    },
    {
      phone: "01700000007", name_en: "Md. Rafiqul Alam", name_bn: "মোঃ রফিকুল আলম", role: "SUBJECT_TEACHER" as const,
      designation: "Subject Teacher, Mathematics", photo_key: "staff-subject-teacher-2",
      qualifications: "M.Sc. in Mathematics, University of Chittagong",
      achievements: null as string | null,
      public_contact_email: "rafiqul.alam@alhumairaschool.edu.bd",
      public_office_location: "Academic Building, Staff Room 3",
      publications: null as { title: string; url: string }[] | null,
    },
    {
      phone: "01700000008", name_en: "Sultana Razia", name_bn: "সুলতানা রাজিয়া", role: "LIBRARIAN" as const,
      designation: "Librarian", photo_key: "staff-librarian",
      qualifications: "M.A. in Library & Information Science, University of Dhaka",
      achievements: null as string | null,
      public_contact_email: "library@alhumairaschool.edu.bd",
      public_office_location: "Library Building",
      publications: null as { title: string; url: string }[] | null,
    },
    {
      phone: "01700000009", name_en: "Md. Jashim Uddin", name_bn: "মোঃ জসিম উদ্দীন", role: "TRANSPORT_MANAGER" as const,
      designation: "Transport Manager", photo_key: "staff-transport-manager",
      qualifications: "B.A., Diploma in Fleet Management",
      achievements: null as string | null,
      public_contact_email: "transport@alhumairaschool.edu.bd",
      public_office_location: "Transport Office",
      publications: null as { title: string; url: string }[] | null,
    },
  ];
  const staffIdByPhone: Record<string, string> = {};
  for (const u of demoStaffUsers) {
    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      update: { name_en: u.name_en, name_bn: u.name_bn },
      create: { name_en: u.name_en, name_bn: u.name_bn, role: u.role, phone: u.phone, password_hash: staffPasswordHash },
    });
    const staffFields = {
      name_en: u.name_en,
      name_bn: u.name_bn,
      designation: u.designation,
      photo_url: pravatar(u.photo_key, 300),
      qualifications: u.qualifications,
      achievements: u.achievements,
      publications: u.publications ?? undefined,
      public_contact_email: u.public_contact_email,
      public_office_location: u.public_office_location,
      show_on_website: true,
    };
    const staff = await prisma.staff.upsert({
      where: { user_id: user.id },
      update: staffFields,
      create: {
        user_id: user.id,
        staff_uid: `STAFF-26-${u.phone.slice(-4)}`,
        phone: u.phone,
        employment_type: "PERMANENT",
        joining_date: new Date("2026-01-01"),
        ...staffFields,
      },
    });
    staffIdByPhone[u.phone] = staff.id;
  }

  // Subject-teacher assignments for the active academic year so the public
  // faculty directory's "Subjects Taught" field isn't empty. section_id is
  // left null (school-wide assignment) since these are demo/placeholder
  // links, not tied to a specific section's real timetable.
  const SUBJECT_ASSIGNMENTS: { phone: string; subjectId: string }[] = [
    { phone: "01700000004", subjectId: "subject-9-BAN1" },
    { phone: "01700000005", subjectId: "subject-9-ENG1" },
    { phone: "01700000005", subjectId: "subject-10-ENG1" },
    { phone: "01700000006", subjectId: "subject-9-PHY" },
    { phone: "01700000007", subjectId: "subject-9-MATH" },
    { phone: "01700000007", subjectId: "subject-10-MATH" },
  ];
  for (const a of SUBJECT_ASSIGNMENTS) {
    // Prisma's compound-unique WhereUniqueInput can't be queried with a
    // literal `null` for the nullable section_id member of
    // @@unique([subject_id, section_id, academic_year_id]) — so this
    // school-wide (section_id: null) assignment is upserted on a
    // deterministic id instead of that compound key.
    await prisma.subjectTeacherAssignment.upsert({
      where: { id: `assignment-${a.subjectId}-${a.phone}` },
      update: { staff_id: staffIdByPhone[a.phone]! },
      create: { id: `assignment-${a.subjectId}-${a.phone}`, subject_id: a.subjectId, section_id: null, academic_year_id: academicYear.id, staff_id: staffIdByPhone[a.phone]! },
    });
  }

  // Placeholder authority signatures — name only, no uploaded image. The
  // admin replaces these with real signature/seal images via Settings.
  await prisma.authoritySignature.upsert({
    where: { id: "signature-principal" },
    update: {},
    create: { id: "signature-principal", role: "PRINCIPAL", display_name: "Principal", designation: "Principal", is_active: true },
  });
  await prisma.authoritySignature.upsert({
    where: { id: "signature-exam-controller" },
    update: {},
    create: { id: "signature-exam-controller", role: "EXAM_CONTROLLER", display_name: "Exam Controller", designation: "Exam Controller", is_active: true },
  });

  // Demo students — Class 9, Section A, with realistic Bangla names,
  // compulsory-subject inheritance, a handful of attendance records, and
  // one tuition invoice each (some paid, some outstanding) so the
  // dashboards/reports have something real to show on a fresh seed.
  const classNine = classes[9];
  const sectionNineA = await prisma.section.findUniqueOrThrow({ where: { id: "class-9-A" } });
  // is_active filter matters on an already-populated database: without it,
  // a deactivated/test-garbage Subject row for this class (confirmed the
  // hard way -- two stray rows literally named "a"/"aa" from earlier ad-hoc
  // testing) still gets inherited by every newly-seeded demo student.
  const compulsorySubjectIds = await prisma.subject
    .findMany({ where: { class_id: classNine.id, is_compulsory: true, is_active: true }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  for (const [index, s] of DEMO_STUDENTS.entries()) {
    const rollNo = String(index + 1).padStart(2, "0");
    const student = await prisma.student.upsert({
      where: { student_uid: `ALh-26-${String(index + 1).padStart(4, "0")}` },
      update: {},
      create: {
        student_uid: `ALh-26-${String(index + 1).padStart(4, "0")}`,
        name_en: s.name_en,
        name_bn: s.name_bn,
        gender: s.gender,
        father_phone: s.father_phone,
        current_class_id: classNine.id,
        current_section_id: sectionNineA.id,
        current_roll_no: rollNo,
        academic_history: { create: { academic_year_id: academicYear.id, class_id: classNine.id, section_id: sectionNineA.id, roll_no: rollNo, status: "PROMOTED" } },
      },
    });

    for (const subjectId of compulsorySubjectIds) {
      await prisma.studentSubject.upsert({
        where: { student_id_subject_id_academic_year_id: { student_id: student.id, subject_id: subjectId, academic_year_id: academicYear.id } },
        update: {},
        create: { student_id: student.id, subject_id: subjectId, academic_year_id: academicYear.id },
      });
    }

    const today = new Date();
    await prisma.attendanceRecord.upsert({
      where: { id: `attendance-${student.id}-today` },
      update: {},
      create: {
        id: `attendance-${student.id}-today`,
        person_id: student.id,
        person_type: "STUDENT",
        student_id: student.id,
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        section_id: sectionNineA.id,
        shift_id: morningShift.id,
        status: index === 0 ? "ABSENT" : "PRESENT",
        source: "MANUAL",
      },
    });

    await prisma.invoice.upsert({
      where: { id: `invoice-${student.id}-jan` },
      update: {},
      create: {
        id: `invoice-${student.id}-jan`,
        // invoice_no is a required, unique business number (see
        // generateInvoiceNo() in server/api) — seed data isn't routed
        // through the real API, so a fixed, deterministic value derived
        // from the same student.id used for the row's own id keeps this
        // upsert idempotent without needing a DB round-trip to count
        // existing rows the way the real generator does.
        invoice_no: `INV-SEED-${student.id}`,
        student_id: student.id,
        academic_year_id: academicYear.id,
        category: "TUITION",
        description: "January tuition fee",
        amount_due: 1500,
        amount_paid: index % 2 === 0 ? 1500 : 0,
        due_date: new Date("2026-01-10"),
        status: index % 2 === 0 ? "PAID" : "PENDING",
        month: 1,
        year: 2026,
      },
    });
  }

  // ── Demo exam with entered marks + a published result (for testing
  // marksheet/report-card/result-lookup PDF generation end to end without
  // needing to hand-build an exam through the UI first) ──
  const demoAdmin = await prisma.user.findUniqueOrThrow({ where: { phone: "01700000000" } });
  const demoExam = await prisma.exam.upsert({
    where: { id: "seed-demo-half-yearly-2026" },
    update: {},
    create: {
      id: "seed-demo-half-yearly-2026",
      academic_year_id: academicYear.id,
      grading_scale_id: gradingScale.id,
      name: "Half Yearly Exam 2026",
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-06-15"),
      status: "PUBLISHED",
    },
  });

  for (const subjectId of compulsorySubjectIds) {
    await prisma.examSubjectConfig.upsert({
      where: { exam_id_subject_id: { exam_id: demoExam.id, subject_id: subjectId } },
      update: {},
      create: {
        exam_id: demoExam.id,
        subject_id: subjectId,
        full_marks_theory: 100,
        full_marks_practical: 0,
        pass_marks_theory: 33,
        pass_marks_practical: 0,
        pass_marks_combined: 33,
      },
    });
  }

  // Targeted by student_uid, NOT by current class/section membership -- a
  // class/section query would also match every other real or test student
  // who happens to share that section on an already-populated database
  // (confirmed the hard way: this pulled in 57 unrelated students before
  // this fix). A demo student who has since been promoted out of Class 9
  // correctly gets no marks for this Class 9 exam -- not a bug to work
  // around.
  const demoClassNineStudents = await prisma.student.findMany({
    where: { student_uid: { in: DEMO_STUDENTS.map((_, i) => `ALh-26-${String(i + 1).padStart(4, "0")}`) }, current_class_id: classNine.id },
  });
  // Per-student baseline spans the real grade range on purpose (one clear
  // fail included) so a generated marksheet/result actually exercises every
  // visual state (A+, mid-range, FAILED) instead of looking suspiciously
  // uniform.
  const STUDENT_MARK_BASELINE = [88, 62, 91, 51, 28];
  for (const [studentIndex, student] of demoClassNineStudents.entries()) {
    const baseline = STUDENT_MARK_BASELINE[studentIndex % STUDENT_MARK_BASELINE.length]!;
    for (const [subjectIndex, subjectId] of compulsorySubjectIds.entries()) {
      const marks = Math.max(0, Math.min(100, baseline + ((subjectIndex * 7) % 15) - 7));
      const { grade_letter, grade_point } = gradeFor(marks);
      await prisma.markEntry.upsert({
        where: { exam_id_student_id_subject_id: { exam_id: demoExam.id, student_id: student.id, subject_id: subjectId } },
        update: {},
        create: {
          exam_id: demoExam.id,
          student_id: student.id,
          subject_id: subjectId,
          marks_theory: marks,
          marks_total: marks,
          grade_letter,
          grade_point,
          status: "APPROVED",
          entered_by_id: demoAdmin.id,
        },
      });
    }
  }

  // Prisma's compound @@unique can't target a NULL group_id directly (the
  // DB enforces that case via a partial unique index instead, per this
  // model's own schema comment) -- findFirst + conditional create instead
  // of .upsert() here.
  const existingResultPublication = await prisma.resultPublication.findFirst({
    where: { exam_id: demoExam.id, class_id: classNine.id, group_id: null },
  });
  if (!existingResultPublication) {
    await prisma.resultPublication.create({
      data: {
        exam_id: demoExam.id,
        class_id: classNine.id,
        group_id: null,
        is_published: true,
        published_at: new Date("2026-06-20"),
        published_by_id: demoAdmin.id,
        is_public: true,
      },
    });
  }

  // ── Demo waiver: a reusable template + one active assignment, so Waiver
  // Setup / the Fee Collection workspace's waiver-line display both have
  // something real to show out of the box ──
  const demoWaiverType = await prisma.waiverType.upsert({
    where: { id: "seed-demo-waiver-sibling" },
    update: {},
    create: {
      id: "seed-demo-waiver-sibling",
      name: "Sibling Discount",
      description: "10% tuition discount for a second enrolled sibling",
      discount_type: "PERCENTAGE",
      discount_value: 10,
      applicable_categories: ["TUITION"],
    },
  });
  if (demoClassNineStudents[0]) {
    await prisma.studentWaiver.upsert({
      where: { id: "seed-demo-waiver-assignment" },
      update: {},
      create: {
        id: "seed-demo-waiver-assignment",
        student_id: demoClassNineStudents[0].id,
        waiver_type_id: demoWaiverType.id,
        assigned_by_id: demoAdmin.id,
      },
    });
  }

  const defaultLeaveTypes = [
    { id: "leave-type-casual", name: "Casual Leave", days_allowed: 10, is_paid: true },
    { id: "leave-type-sick", name: "Sick Leave", days_allowed: 14, is_paid: true },
    { id: "leave-type-earned", name: "Earned Leave", days_allowed: 15, is_paid: true },
    { id: "leave-type-unpaid", name: "Unpaid Leave", days_allowed: 30, is_paid: false },
  ];
  for (const lt of defaultLeaveTypes) {
    await prisma.leaveType.upsert({ where: { id: lt.id }, update: {}, create: lt });
  }

  // Editable Role & Permission matrix (Phase 84). Exact, verified mirror of
  // server/api/src/lib/roles.ts's hardcoded arrays as of the Phase 84
  // cutover — copied field-for-field, not retyped from memory. STAFF_READ_ROLES
  // is deliberately excluded: exported from roles.ts but confirmed unused by
  // any authorize() call anywhere in the API, so it gates nothing and would
  // only confuse an admin editing a permission with no visible effect.
  const PERMISSION_CATALOG: { key: string; label: string; category: string; roles: string[] }[] = [
    { key: "SETTINGS_INSTITUTION_ROLES", label: "Institution Settings", category: "Settings", roles: ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"] },
    { key: "SETTINGS_ACADEMIC_ROLES", label: "Academic Settings", category: "Settings", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
    { key: "SETTINGS_USERS_ROLES", label: "User Accounts", category: "Settings", roles: ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"] },
    { key: "DEVICE_MANAGE_ROLES", label: "Biometric Device Management", category: "Settings", roles: ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"] },
    { key: "STUDENT_CRUD_ROLES", label: "Student CRUD", category: "Students", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "REGISTRAR"] },
    { key: "STUDENT_PROMOTE_ROLES", label: "Student Promotion", category: "Students", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
    { key: "ATTENDANCE_MARK_ROLES", label: "Attendance Marking", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"] },
    { key: "EXAM_MANAGE_ROLES", label: "Exam Management", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
    { key: "MARK_ENTRY_ROLES", label: "Mark Entry", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER", "CLASS_TEACHER"] },
    { key: "MARK_VIEW_ROLES", label: "Mark View (read-only)", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER", "CLASS_TEACHER"] },
    { key: "MARK_APPROVAL_ROLES", label: "Mark Approval", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
    { key: "RESULT_PUBLISH_ROLES", label: "Result Publish", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
    { key: "QUIZ_MANAGE_ROLES", label: "Quiz Management", category: "Academic", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER"] },
    { key: "FEE_COLLECTION_ROLES", label: "Fee Collection", category: "Fees & Accounts", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { key: "ACCOUNTS_MANAGE_ROLES", label: "Accounts Management", category: "Fees & Accounts", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { key: "VOUCHER_APPROVE_ROLES", label: "Voucher Approval", category: "Fees & Accounts", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "PRINCIPAL"] },
    { key: "VOUCHER_POST_ROLES", label: "Voucher Posting", category: "Fees & Accounts", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { key: "INVENTORY_MANAGE_ROLES", label: "Inventory Management", category: "Fees & Accounts", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { key: "REQUISITION_APPROVE_ROLES", label: "Requisition Approval", category: "Fees & Accounts", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "HEAD_OF_DEPT"] },
    { key: "ADMISSION_MANAGE_ROLES", label: "Admission Management", category: "Admission", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
    { key: "ADMISSION_ENROLL_ROLES", label: "Admission Enrollment", category: "Admission", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
    { key: "WEBSITE_CONTENT_ROLES", label: "Website Content", category: "Website", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "IT_ADMIN"] },
    { key: "HR_MANAGE_ROLES", label: "HR Management", category: "HR & Payroll", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
    { key: "LEAVE_APPROVE_ROLES", label: "Leave Approval", category: "HR & Payroll", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
    { key: "PAYROLL_MANAGE_ROLES", label: "Payroll Management", category: "HR & Payroll", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { key: "APPRAISAL_MANAGE_ROLES", label: "Staff Appraisals", category: "HR & Payroll", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
    { key: "LIBRARY_MANAGE_ROLES", label: "Library Management", category: "Facilities", roles: ["SUPER_ADMIN", "ADMIN", "LIBRARIAN"] },
    { key: "TRANSPORT_MANAGE_ROLES", label: "Transport Management", category: "Facilities", roles: ["SUPER_ADMIN", "ADMIN", "TRANSPORT_MANAGER"] },
    { key: "HOSTEL_MANAGE_ROLES", label: "Hostel Management", category: "Facilities", roles: ["SUPER_ADMIN", "ADMIN", "HOSTEL_MANAGER"] },
    { key: "HEALTH_MANAGE_ROLES", label: "Health Records", category: "Student Welfare", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER"] },
    { key: "DISCIPLINE_MANAGE_ROLES", label: "Discipline Records", category: "Student Welfare", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER"] },
    { key: "COMPLAINT_MANAGE_ROLES", label: "Complaint Management", category: "Student Welfare", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
    { key: "ANALYTICS_MESSAGE_ROLES", label: "At-Risk Analytics & Messaging", category: "Communications", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "ACCOUNTANT"] },
    { key: "BULK_SMS_ROLES", label: "Bulk SMS", category: "Communications", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
    { key: "PTM_MANAGE_ROLES", label: "Parent-Teacher Meeting Scheduling", category: "Communications", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER"] },
    { key: "PORTAL_ROLES", label: "Portal Access (Student/Guardian)", category: "System Access", roles: ["STUDENT", "GUARDIAN"] },
    { key: "STAFF_ONLY_ROLES", label: "Staff-Only Access Gate", category: "System Access", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT", "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER", "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN"] },
    { key: "TEACHER_APP_ROLES", label: "Teacher App Access", category: "System Access", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"] },
  ];

  for (const perm of PERMISSION_CATALOG) {
    const permission = await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: { key: perm.key, label: perm.label, category: perm.category },
    });
    for (const role of perm.roles) {
      await prisma.rolePermission.upsert({
        where: { role_permission_id: { role: role as never, permission_id: permission.id } },
        update: {},
        create: { role: role as never, permission_id: permission.id },
      });
    }
  }

  // ── Public website content ──
  // Everything below backs GET /api/content/* (server/api/src/modules/content),
  // which apps/website reads read-only. Before this block every one of these
  // endpoints legitimately returned an empty array — the redesigned public
  // pages had nothing to render. Ids are deterministic so `update` (not just
  // `create`) is populated too, meaning edits here actually take effect on
  // a reseed instead of being a one-time-only insert.

  const SLIDERS = [
    {
      id: "slider-welcome",
      image_url: picsum("hero-welcome", 1600, 700),
      title: "Welcome to Alhumaira Model School & College",
      subtitle: "Nurturing knowledge, character, and community since 2010.",
      btn_text: "Learn More",
      btn_link: "/about",
      display_order: 1,
    },
    {
      id: "slider-admission",
      image_url: picsum("hero-admission", 1600, 700),
      title: "Admissions Open for 2026-2027",
      subtitle: "Limited seats available across Classes 6 to 10 — apply today.",
      btn_text: "Apply Now",
      btn_link: "/admission",
      display_order: 2,
    },
    {
      id: "slider-campus",
      image_url: picsum("hero-campus", 1600, 700),
      title: "A Campus Built for Learning",
      subtitle: "Modern classrooms, science labs, and a library that inspires curiosity.",
      btn_text: "Explore Facilities",
      btn_link: "/about/facilities",
      display_order: 3,
    },
  ];
  for (const { id, ...data } of SLIDERS) {
    await prisma.sliderImage.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  const NOTICES = [
    {
      id: "notice-admission-2026",
      title: "Admission for 2026-2027 Academic Year Now Open",
      body: "<p>Alhumaira Model School &amp; College invites applications for Classes 6 to 10 for the 2026-2027 academic year. Interested guardians may apply online through the Admission section of this website.</p>",
      audience: "PUBLIC" as const,
      is_pinned: true,
      publish_at: new Date("2026-06-01"),
    },
    {
      id: "notice-half-yearly-routine",
      title: "Half-Yearly Examination Routine Published",
      body: "<p>The routine for the Half-Yearly Examination 2026 has been published. All students are advised to check the Events section for exact dates.</p>",
      audience: "STUDENTS" as const,
      is_pinned: true,
      publish_at: new Date("2026-07-05"),
    },
    {
      id: "notice-fee-due",
      title: "July Tuition Fee Due Notice",
      body: "<p>Guardians are requested to clear July's tuition fee by the 10th of the month to avoid late fees. Payment can be made through the Guardian Portal.</p>",
      audience: "GUARDIANS" as const,
      is_pinned: false,
      publish_at: new Date("2026-07-10"),
    },
    {
      id: "notice-pta-meeting",
      title: "Parent-Teacher Meeting Scheduled for Class 9 & 10",
      body: "<p>A Parent-Teacher Meeting for Class 9 and 10 guardians will be held to discuss the upcoming Half-Yearly Examination and student progress.</p>",
      audience: "GUARDIANS" as const,
      is_pinned: false,
      publish_at: new Date("2026-07-18"),
    },
    {
      id: "notice-science-fair",
      title: "Annual Science Fair 2026 — Registration Open",
      body: "<p>Students interested in showcasing a science project at this year's Science Fair may register with their class teacher by the end of the month.</p>",
      audience: "STUDENTS" as const,
      is_pinned: false,
      publish_at: new Date("2026-07-15"),
    },
    {
      id: "notice-staff-meeting",
      title: "Monthly Staff Meeting — July 2026",
      body: "<p>All teaching and non-teaching staff are requested to attend the monthly coordination meeting in the Admin Building conference room.</p>",
      audience: "STAFF" as const,
      is_pinned: false,
      publish_at: new Date("2026-07-20"),
    },
    {
      id: "notice-library-hours",
      title: "Revised Library Hours for Exam Season",
      body: "<p>The library will remain open until 5:00 PM on weekdays during the examination season to support student revision.</p>",
      audience: "STUDENTS" as const,
      is_pinned: false,
      publish_at: new Date("2026-07-12"),
    },
    {
      id: "notice-sports-day",
      title: "Annual Sports Day 2026 — Save the Date",
      body: "<p>This year's Annual Sports Day will be held on the main campus ground. Interhouse event registration begins next week.</p>",
      audience: "PUBLIC" as const,
      is_pinned: true,
      publish_at: new Date("2026-07-01"),
    },
    {
      id: "notice-eid-holiday",
      title: "Eid-ul-Adha Holiday Notice",
      body: "<p>The institution will remain closed for Eid-ul-Adha. Classes resume as per the regular routine after the holiday.</p>",
      audience: "PUBLIC" as const,
      is_pinned: false,
      publish_at: new Date("2026-05-20"),
    },
  ];
  for (const { id, ...data } of NOTICES) {
    await prisma.notice.upsert({
      where: { id },
      update: { ...data, is_published: true, is_public_website: true },
      create: { id, ...data, is_published: true, is_public_website: true },
    });
  }

  const GALLERY_ALBUMS: { id: string; name: string; date: string; imageKeys: string[] }[] = [
    { id: "album-campus", name: "Our Campus", date: "2026-01-15", imageKeys: ["campus-1", "campus-2", "campus-3", "campus-4"] },
    { id: "album-sports-day", name: "Annual Sports Day 2026", date: "2026-02-20", imageKeys: ["sports-1", "sports-2", "sports-3", "sports-4", "sports-5"] },
    { id: "album-science-fair", name: "Science Fair 2026", date: "2026-03-10", imageKeys: ["sciencefair-1", "sciencefair-2", "sciencefair-3"] },
    { id: "album-cultural-program", name: "Cultural Program — Pohela Boishakh", date: "2026-04-14", imageKeys: ["cultural-1", "cultural-2", "cultural-3", "cultural-4"] },
  ];
  for (const a of GALLERY_ALBUMS) {
    const album = await prisma.galleryAlbum.upsert({
      where: { id: a.id },
      update: { name: a.name, date: new Date(a.date), cover_url: picsum(a.imageKeys[0]!, 800, 600), is_public: true },
      create: { id: a.id, name: a.name, date: new Date(a.date), cover_url: picsum(a.imageKeys[0]!, 800, 600), is_public: true },
    });
    for (const [index, key] of a.imageKeys.entries()) {
      await prisma.galleryImage.upsert({
        where: { id: `${a.id}-img-${index + 1}` },
        update: { image_url: picsum(key, 800, 600), display_order: index },
        create: { id: `${a.id}-img-${index + 1}`, album_id: album.id, image_url: picsum(key, 800, 600), display_order: index },
      });
    }
  }

  const DOWNLOADS = [
    { id: "download-syllabus-9-10", title: "Class 9-10 Syllabus 2026", category: "SYLLABUS" as const },
    { id: "download-exam-schedule-half-yearly", title: "Half-Yearly Exam Schedule 2026", category: "EXAM_SCHEDULE" as const },
    { id: "download-class-routine-morning", title: "Class Routine — Morning Shift 2026", category: "CLASS_ROUTINE" as const },
    { id: "download-academic-calendar-2026", title: "Academic Calendar 2026", category: "ACADEMIC_CALENDAR" as const },
    { id: "download-admission-form", title: "Student Admission Form", category: "FORMS" as const },
    { id: "download-library-circular", title: "Circular: Library Rules 2026", category: "CIRCULARS" as const },
  ];
  for (const { id, ...data } of DOWNLOADS) {
    // No real files back these seed rows — file_url points at a stable
    // public sample PDF so the "Download" button resolves to *something*
    // rather than a dead link. An admin uploads the real document later.
    const file_url = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    const file_name = `${data.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf`;
    await prisma.download.upsert({
      where: { id },
      update: { ...data, file_url, file_name, is_public: true },
      create: { id, ...data, file_url, file_name, is_public: true },
    });
  }

  const STATIC_PAGES: { page_key: string; title_en: string; content_en: string }[] = [
    {
      page_key: "about",
      title_en: "About Us",
      content_en:
        "<p>Welcome to <strong>Alhumaira Model School &amp; College</strong> — a place where knowledge meets character, and every student is given the tools to build a purposeful life.</p>" +
        "<p>Established in <strong>2010</strong> in Chattogram, we have grown from a small community initiative into one of the area's most trusted educational institutions, serving over <strong>800 students</strong> across Classes 6 to 10 under the Bangladesh Secondary and Higher Secondary Education system.</p>" +
        "<h2>Who We Are</h2>" +
        "<p>We are a team of <strong>35+ dedicated teachers and staff</strong> who believe that education is not just about passing examinations — it is about nurturing curious, responsible, and compassionate human beings.</p>" +
        "<ul>" +
        "<li><strong>Founded:</strong> 2010, Chattogram, Bangladesh</li>" +
        "<li><strong>Board:</strong> Chittagong Education Board (BISE Chattogram)</li>" +
        "<li><strong>Classes Offered:</strong> Class 6 to Class 10</li>" +
        "<li><strong>Medium of Instruction:</strong> Bengali (Bangla Medium)</li>" +
        "<li><strong>Total Students:</strong> 800+ enrolled (2026)</li>" +
        "<li><strong>Faculty:</strong> 35+ qualified teachers</li>" +
        "</ul>" +
        "<h2>What Makes Us Different</h2>" +
        "<p>At Alhumaira, we combine academic rigour with moral and spiritual values. Our classrooms are structured for critical thinking, and our co-curricular activities — from science fairs to debate competitions — help students discover and develop their unique strengths.</p>" +
        "<blockquote>We do not just teach — we inspire. Our goal is to produce graduates who think deeply, act ethically, and contribute meaningfully to their communities.</blockquote>" +
        "<h2>Our Commitment</h2>" +
        "<p>We are committed to maintaining a safe, inclusive, and stimulating environment for every student. Regular guardian communication, transparent academic reporting, and continuous teacher development are pillars of our school culture.</p>",
    },
    {
      page_key: "history",
      title_en: "Our History",
      content_en:
        "<h2>Founding Years (2010–2013)</h2>" +
        "<p>Alhumaira Model School &amp; College was founded in <strong>2010</strong> by a group of educators and community leaders in Chattogram who shared a vision of accessible, values-based education. Starting with only 3 classrooms and 120 students, the institution quickly earned a reputation for academic rigour and moral grounding.</p>" +
        "<h2>Growth &amp; Expansion (2014–2020)</h2>" +
        "<p>Within four years, enrolment had tripled. The school expanded its campus — adding a dedicated science laboratory, a computer lab with 30 stations, and a well-stocked library. Academic results consistently ranked among the top in the Chittagong Board zone.</p>" +
        "<blockquote>Every student deserves an education that develops both mind and character. — Founding Charter, 2010</blockquote>" +
        "<h2>Today</h2>" +
        "<p>The institution now serves students from Class 6 through Class 10, with over <strong>800 enrolled students</strong> and a faculty of 35+ dedicated teachers. We continue to grow with the same founding spirit that started it all.</p>",
    },
    {
      page_key: "mission_vision",
      title_en: "Mission & Vision",
      content_en:
        "<h2>Our Mission</h2>" +
        "<p>To provide quality, values-based education that nurtures every student's <strong>intellectual, moral, and physical development</strong> — preparing them to be responsible citizens and lifelong learners who contribute meaningfully to society.</p>" +
        "<h2>Our Vision</h2>" +
        "<p>To be a leading center of academic and moral excellence in Chattogram — producing graduates who lead with <strong>knowledge, integrity, and compassion</strong>.</p>" +
        "<h2>Our Core Values</h2>" +
        "<ul>" +
        "<li><strong>Excellence</strong> — We hold ourselves to the highest standard in teaching and learning.</li>" +
        "<li><strong>Integrity</strong> — Honesty and ethics are non-negotiable in all that we do.</li>" +
        "<li><strong>Inclusivity</strong> — Every student, regardless of background, deserves quality education.</li>" +
        "<li><strong>Compassion</strong> — We treat every person in our community with dignity and care.</li>" +
        "</ul>",
    },
    {
      page_key: "facilities",
      title_en: "Facilities",
      content_en:
        "<p>Our campus is built to support <strong>well-rounded learning</strong> — combining strong academics with the physical and spiritual wellbeing of every student.</p>" +
        "<h2>Academic Facilities</h2>" +
        "<ul>" +
        "<li><strong>Science Laboratory</strong> — Fully equipped for Physics, Chemistry, and Biology practicals for Classes 9–10.</li>" +
        "<li><strong>ICT Lab</strong> — 30-station computer laboratory with broadband internet access.</li>" +
        "<li><strong>Library</strong> — 2,000+ titles, open during all school hours, with a dedicated reading area.</li>" +
        "</ul>" +
        "<h2>Co-curricular &amp; Welfare</h2>" +
        "<ul>" +
        "<li><strong>Sports Ground</strong> — Dedicated field for football, cricket, and inter-house athletics.</li>" +
        "<li><strong>Musalla (Prayer Room)</strong> — Available for daily Zuhr and Asr prayers.</li>" +
        "<li><strong>CCTV Surveillance</strong> — Campus-wide monitoring for the safety of all students and staff.</li>" +
        "<li><strong>Canteen</strong> — Hygienic on-campus food service with affordable daily menus.</li>" +
        "</ul>",
    },
    {
      page_key: "achievements",
      title_en: "Achievements",
      content_en:
        "<p>We are proud of the dedication of our students and staff. Here are some highlights from recent years.</p>" +
        "<h2>Academic Excellence</h2>" +
        "<ul>" +
        "<li><strong>100% pass rate</strong> in the SSC Examination for three consecutive years (2023, 2024, 2025).</li>" +
        "<li><strong>Top 5 position</strong> in the Chittagong Board zone rankings, 2025.</li>" +
        "<li>18 students received <strong>A+ (GPA 5.00)</strong> in the 2025 SSC Examinations.</li>" +
        "</ul>" +
        "<h2>Co-curricular Honours</h2>" +
        "<ul>" +
        "<li><strong>District Champion</strong> — Inter-School Science Fair, 2025.</li>" +
        "<li><strong>Runner-up</strong> — Divisional Debate Competition, 2024.</li>" +
        "<li><strong>1st Place</strong> — Chattogram Zonal Math Olympiad, 2024.</li>" +
        "</ul>" +
        "<h2>Staff Recognition</h2>" +
        "<ul>" +
        "<li>Principal Mohammad Aminul Islam awarded <strong>District Best Headteacher</strong>, 2022.</li>" +
        "<li>Two teachers recognised at the <strong>National Teacher Excellence Awards</strong>, 2023.</li>" +
        "</ul>",
    },
    {
      page_key: "admission_info",
      title_en: "Admission Information",
      content_en:
        "<p>Admission to Alhumaira Model School &amp; College follows a simple process: complete the online application, sit for a short admission assessment, and submit the required documents upon confirmation.</p>" +
        "<p>Seats are limited and offered on a first-come, first-assessed basis for each class. See the Admission page for currently open cycles, seat counts, and fees.</p>",
    },
    {
      page_key: "principal_message",
      title_en: "Principal's Message",
      content_en:
        "<p>Dear students, parents, and guardians,</p>" +
        "<p>It is my privilege to welcome you to Alhumaira Model School &amp; College. We believe that every child carries unique potential, and our role as educators is to nurture that potential with patience, discipline, and care.</p>" +
        "<p>Our teachers are committed not only to academic excellence but to building character — honesty, responsibility, and respect for others. I invite you to be part of our growing community.</p>" +
        "<p>With warm regards,<br/>Mohammad Aminul Islam<br/>Principal</p>",
    },
    {
      page_key: "vice_principal_message",
      title_en: "Vice Principal's Message",
      content_en:
        "<p>Welcome to our school. As Vice Principal, I work closely with our teaching staff every day to ensure that classroom instruction stays both rigorous and genuinely supportive of each student's pace of learning.</p>" +
        "<p>We encourage open communication between guardians and teachers — your involvement makes a real difference in your child's progress.</p>",
    },
    {
      page_key: "chairman_message",
      title_en: "Chairman's Message",
      content_en:
        "<p>On behalf of the Governing Body, I am proud of how far this institution has come since 2010. Our committee remains committed to investing in better facilities, fair fee structures, and the long-term academic reputation of this school.</p>" +
        "<p>We thank every guardian and student for placing their trust in us.</p><p>— Alhaj Md. Abdul Kader, Chairman</p>",
    },
    {
      page_key: "course_curriculum",
      title_en: "Course Curriculum",
      content_en:
        "<p>Classes 6 to 8 follow the National Curriculum and Textbook Board (NCTB) syllabus with compulsory subjects across Bangla, English, Mathematics, Science, and Bangladesh &amp; Global Studies.</p>" +
        "<p>Classes 9 and 10 follow the Science group curriculum under the Chittagong Education Board, with Physics, Chemistry, Higher Mathematics, and Biology offered alongside the compulsory subjects, leading to the SSC Examination.</p>",
    },
    {
      page_key: "grading_system",
      title_en: "Grading System",
      content_en:
        "<p>We follow the standard <strong>Bangladesh Board grading scale</strong> with a maximum GPA of 5.00, aligned with the National Curriculum and Textbook Board (NCTB) guidelines.</p>" +
        "<h2>Grade Scale</h2>" +
        "<table>" +
        "<thead><tr><th>Marks Range</th><th>Grade Letter</th><th>GPA</th><th>Performance</th></tr></thead>" +
        "<tbody>" +
        "<tr><td>80 – 100</td><td><strong>A+</strong></td><td>5.00</td><td>Excellent</td></tr>" +
        "<tr><td>70 – 79</td><td><strong>A</strong></td><td>4.00</td><td>Very Good</td></tr>" +
        "<tr><td>60 – 69</td><td><strong>A−</strong></td><td>3.50</td><td>Good</td></tr>" +
        "<tr><td>50 – 59</td><td><strong>B</strong></td><td>3.00</td><td>Above Average</td></tr>" +
        "<tr><td>40 – 49</td><td><strong>C</strong></td><td>2.00</td><td>Average</td></tr>" +
        "<tr><td>33 – 39</td><td><strong>D</strong></td><td>1.00</td><td>Pass</td></tr>" +
        "<tr><td>Below 33</td><td><strong>F</strong></td><td>0.00</td><td>Fail</td></tr>" +
        "</tbody>" +
        "</table>" +
        "<h2>GPA Calculation</h2>" +
        "<p>The overall GPA is calculated as the <strong>average of all subject GPAs</strong>. Subjects with practical components (e.g., Science, ICT) include both written and practical marks in the final tally.</p>" +
        "<blockquote>A student who obtains F in any subject is considered to have failed the examination, regardless of overall GPA.</blockquote>",
    },
    {
      page_key: "academic_regulations",
      title_en: "Academic Regulations",
      content_en:
        "<h2>Attendance Policy</h2>" +
        "<p>Students are required to maintain a minimum of <strong>75% attendance</strong> to be eligible to sit for the Annual Final Examination. Attendance is recorded daily and reported to guardians each month.</p>" +
        "<h2>Examination Structure</h2>" +
        "<p>Three examinations are held each academic year, each contributing to the final result:</p>" +
        "<table>" +
        "<thead><tr><th>Examination</th><th>Timing</th><th>Weight</th></tr></thead>" +
        "<tbody>" +
        "<tr><td>Class Test</td><td>Throughout the year</td><td>10%</td></tr>" +
        "<tr><td>Half-Yearly Examination</td><td>July – August</td><td>30%</td></tr>" +
        "<tr><td>Annual Final Examination</td><td>November – December</td><td>60%</td></tr>" +
        "</tbody>" +
        "</table>" +
        "<h2>Promotion Policy</h2>" +
        "<p>Promotion to the next class requires passing all <strong>compulsory subjects</strong> in the Annual Final Examination. Students who fail one subject may be eligible for a supplementary examination at the discretion of the Academic Committee.</p>" +
        "<blockquote>Academic integrity is taken seriously. Any form of cheating or plagiarism in examinations will result in immediate disqualification and may lead to suspension.</blockquote>",
    },
    {
      page_key: "policies",
      title_en: "School Policies",
      content_en:
        "<h2>Dress Code</h2>" +
        "<p>Students must wear the <strong>prescribed school uniform</strong> on all school days. Uniforms must be clean, properly fitted, and complete — including the school badge. Violation of the dress code will result in a formal warning.</p>" +
        "<h2>Conduct &amp; Discipline</h2>" +
        "<ul>" +
        "<li>Students are expected to treat all teachers, staff, and fellow students with respect.</li>" +
        "<li>Mobile phones are <strong>not permitted</strong> inside classrooms without prior written permission from a teacher.</li>" +
        "<li>Bullying, harassment, or discrimination of any kind will not be tolerated and may result in suspension.</li>" +
        "</ul>" +
        "<h2>Homework &amp; Guardian Involvement</h2>" +
        "<p>Homework is assigned daily across all subjects. Subject teachers review homework at the start of each class. Guardians are strongly encouraged to review their child's <strong>homework diary</strong> every evening and sign it weekly.</p>" +
        "<blockquote>An involved guardian is a student's greatest academic advantage. We welcome your regular communication with class teachers.</blockquote>",
    },
  ];
  for (const p of STATIC_PAGES) {
    await prisma.staticPage.upsert({
      where: { page_key: p.page_key },
      update: { title_en: p.title_en, content_en: p.content_en, is_published: true },
      create: { page_key: p.page_key, title_en: p.title_en, content_en: p.content_en, is_published: true },
    });
  }

  const GOVERNING_BODY = [
    { id: "gov-chairman", name: "Alhaj Md. Abdul Kader", designation: "Chairman", group: "Executive Committee", display_order: 1, bio: "Founding chairman of the Governing Body, serving since 2010." },
    { id: "gov-vice-chairman", name: "Mahmuda Khatun", designation: "Vice Chairman", group: "Executive Committee", display_order: 2, bio: "Local education activist and long-time supporter of the institution." },
    { id: "gov-secretary", name: "Md. Nurul Amin", designation: "Secretary", group: "Executive Committee", display_order: 3, bio: "Manages governing body correspondence and record-keeping." },
    { id: "gov-member-1", name: "Rashida Sultana", designation: "Member", group: "General Members", display_order: 4, bio: "Guardian representative on the Governing Body." },
    { id: "gov-member-2", name: "Md. Habibur Rahman", designation: "Member", group: "General Members", display_order: 5, bio: "Local businessman and community representative." },
    { id: "gov-member-3", name: "Ayesha Siddika", designation: "Member", group: "General Members", display_order: 6, bio: "Retired educator and community representative." },
  ];
  for (const { id, name, ...data } of GOVERNING_BODY) {
    const photo_url = pravatar(id, 300);
    await prisma.governingBodyMember.upsert({
      where: { id },
      update: { name, ...data, photo_url, is_active: true },
      create: { id, name, ...data, photo_url, is_active: true },
    });
  }

  const EVENTS = [
    { id: "event-half-yearly-exam", name: "Half-Yearly Examination Starts", type: "EXAM", date_from: "2026-08-03", date_to: "2026-08-15" },
    { id: "event-national-mourning-day", name: "National Mourning Day", type: "HOLIDAY", date_from: "2026-08-15", date_to: null },
    { id: "event-sports-day", name: "Annual Sports Day", type: "GENERAL", date_from: "2026-08-25", date_to: null },
    { id: "event-pta-meeting", name: "Parent-Teacher Meeting", type: "MEETING", date_from: "2026-07-30", date_to: null },
    { id: "event-admission-test", name: "Admission Test for New Session", type: "ADMISSION", date_from: "2026-07-28", date_to: null },
    { id: "event-science-fair", name: "Science Fair 2026", type: "GENERAL", date_from: "2026-03-10", date_to: null },
    { id: "event-independence-day", name: "Independence Day Celebration", type: "HOLIDAY", date_from: "2026-03-26", date_to: null },
    { id: "event-staff-workshop", name: "Staff Development Workshop", type: "MEETING", date_from: "2026-06-15", date_to: null },
  ];
  for (const { id, date_from, date_to, ...data } of EVENTS) {
    const dates = { date_from: new Date(date_from), date_to: date_to ? new Date(date_to) : null };
    await prisma.event.upsert({
      where: { id },
      update: { ...data, ...dates, is_public: true },
      create: { id, ...data, ...dates, is_public: true },
    });
  }

  const ADMISSION_CYCLES = [
    { id: "admission-cycle-class6", class_id: "class-6", name: "Class 6 Admission 2026-2027", open_date: "2026-06-01", close_date: "2026-08-31", seat_count: 60, app_fee: 500, form_fee: 1000 },
    { id: "admission-cycle-class9", class_id: "class-9", name: "Class 9 Admission 2026-2027", open_date: "2026-06-15", close_date: "2026-09-15", seat_count: 40, app_fee: 500, form_fee: 1000 },
  ];
  for (const { id, open_date, close_date, ...data } of ADMISSION_CYCLES) {
    const dates = { open_date: new Date(open_date), close_date: new Date(close_date) };
    await prisma.admissionCycle.upsert({
      where: { id },
      update: { ...data, ...dates, academic_year_id: academicYear.id, is_open: true, is_published: true },
      create: { id, ...data, ...dates, academic_year_id: academicYear.id, is_open: true, is_published: true },
    });
  }

  const JOB_POSTINGS = [
    {
      id: "job-subject-teacher-physics",
      title: "Subject Teacher — Physics",
      department: "Science",
      description: "We are looking for an experienced Physics teacher for Classes 9-10 (Science group), starting the 2026-2027 academic year.",
      requirements: "M.Sc. in Physics with B.Ed.; minimum 2 years of teaching experience preferred.",
      deadline: "2026-08-31",
    },
    {
      id: "job-accountant-part-time",
      title: "Accountant (Part-Time)",
      department: "Accounts",
      description: "Seeking a part-time accountant to assist with fee collection records and monthly reporting.",
      requirements: "B.Com or equivalent; familiarity with basic accounting software.",
      deadline: "2026-08-15",
    },
    {
      id: "job-librarian",
      title: "Librarian",
      department: "Library",
      description: "Manage the school library, assist students with resources, and maintain the book catalog.",
      requirements: "Degree in Library & Information Science preferred.",
      deadline: "2026-08-20",
    },
  ];
  for (const { id, deadline, ...data } of JOB_POSTINGS) {
    await prisma.jobPosting.upsert({
      where: { id },
      update: { ...data, deadline: new Date(deadline), is_published: true },
      create: { id, ...data, deadline: new Date(deadline), is_published: true },
    });
  }

  const IMPORTANT_LINKS = [
    { id: "link-moedu", title: "Ministry of Education, Bangladesh", url: "https://moedu.gov.bd", display_order: 1 },
    { id: "link-ctg-board", title: "Chittagong Education Board", url: "http://www.bise-ctg.gov.bd", display_order: 2 },
    { id: "link-eboard-results", title: "Education Board Results", url: "http://www.educationboardresults.gov.bd", display_order: 3 },
    { id: "link-banbeis", title: "BANBEIS", url: "http://www.banbeis.gov.bd", display_order: 4 },
    { id: "link-nctb", title: "National Curriculum & Textbook Board", url: "http://www.nctb.gov.bd", display_order: 5 },
    { id: "link-ntrca", title: "Teacher's Registration & Certification Authority", url: "http://ntrca.gov.bd", display_order: 6 },
    { id: "link-dshe", title: "Directorate of Secondary and Higher Education", url: "http://dshe.gov.bd", display_order: 7 },
  ];
  for (const { id, ...data } of IMPORTANT_LINKS) {
    await prisma.importantLink.upsert({
      where: { id },
      update: { ...data, is_active: true },
      create: { id, ...data, is_active: true },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
