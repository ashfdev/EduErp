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

const NOTIFICATION_TRIGGERS = ["ABSENCE", "LATE", "FEE_DUE", "RESULT_PUBLISHED", "NOTICE", "ADMISSION_CONFIRM"] as const;
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
};

async function main() {
  await prisma.institutionProfile.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name_en: "My Institution",
      type: "SCHOOL",
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
      prefix: "STU",
      separator: "-",
      sequence_digits: 4,
    },
  });

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
