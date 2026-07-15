import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BD_BOARD_RANGES = [
  { min_marks: 80, max_marks: 100, grade_letter: "A+", grade_point: 5.0, remarks: "Excellent", display_order: 1 },
  { min_marks: 70, max_marks: 79.99, grade_letter: "A", grade_point: 4.0, remarks: "Very Good", display_order: 2 },
  { min_marks: 60, max_marks: 69.99, grade_letter: "A-", grade_point: 3.5, remarks: "Good", display_order: 3 },
  { min_marks: 50, max_marks: 59.99, grade_letter: "B", grade_point: 3.0, remarks: "Above Average", display_order: 4 },
  { min_marks: 40, max_marks: 49.99, grade_letter: "C", grade_point: 2.0, remarks: "Average", display_order: 5 },
  { min_marks: 33, max_marks: 39.99, grade_letter: "D", grade_point: 1.0, remarks: "Pass", display_order: 6 },
  { min_marks: 0, max_marks: 32.99, grade_letter: "F", grade_point: 0.0, remarks: "Fail", display_order: 7 },
];

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
};

const NOTIFICATION_TRIGGERS = ["ABSENCE", "LATE", "FEE_DUE", "RESULT_PUBLISHED", "NOTICE", "ADMISSION_CONFIRM", "PORTAL_LOGIN_CREATED"] as const;
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
  await prisma.institutionProfile.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name_en: "Alhumaira Model School & College",
      name_bn: "আলহুমাইরা মডেল স্কুল অ্যান্ড কলেজ",
      type: "SCHOOL",
      eiin: "123456",
      board: "Chittagong",
      primary_color: "#1a3c4a",
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

  const examTypes = [
    { code: "CT", name: "Class Test", display_order: 1, weight_in_annual: 10 },
    { code: "HALF", name: "Half Yearly", display_order: 2, weight_in_annual: 30 },
    { code: "FINAL", name: "Annual Final", display_order: 3, weight_in_annual: 60, is_board_exam: true },
  ];
  for (const et of examTypes) {
    await prisma.examTypeConfig.upsert({
      where: { code: et.code },
      update: {},
      create: et,
    });
  }

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
  const demoStaffUsers = [
    { phone: "01700000001", name_en: "Principal", role: "PRINCIPAL" as const },
    { phone: "01700000002", name_en: "Exam Controller", role: "EXAM_CONTROLLER" as const },
    { phone: "01700000003", name_en: "Accountant", role: "ACCOUNTANT" as const },
    { phone: "01700000004", name_en: "Class Teacher One", role: "CLASS_TEACHER" as const },
    { phone: "01700000005", name_en: "Subject Teacher One", role: "SUBJECT_TEACHER" as const },
  ];
  for (const u of demoStaffUsers) {
    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: { name_en: u.name_en, role: u.role, phone: u.phone, password_hash: staffPasswordHash },
    });
    await prisma.staff.upsert({
      where: { user_id: user.id },
      update: {},
      create: {
        user_id: user.id,
        staff_uid: `STAFF-26-${u.phone.slice(-4)}`,
        name_en: u.name_en,
        designation: u.role.replace(/_/g, " "),
        phone: u.phone,
        employment_type: "PERMANENT",
        joining_date: new Date("2026-01-01"),
      },
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
  const compulsorySubjectIds = await prisma.subject
    .findMany({ where: { class_id: classNine.id, is_compulsory: true }, select: { id: true } })
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

  const defaultLeaveTypes = [
    { id: "leave-type-casual", name: "Casual Leave", days_allowed: 10, is_paid: true },
    { id: "leave-type-sick", name: "Sick Leave", days_allowed: 14, is_paid: true },
    { id: "leave-type-earned", name: "Earned Leave", days_allowed: 15, is_paid: true },
    { id: "leave-type-unpaid", name: "Unpaid Leave", days_allowed: 30, is_paid: false },
  ];
  for (const lt of defaultLeaveTypes) {
    await prisma.leaveType.upsert({ where: { id: lt.id }, update: {}, create: lt });
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
