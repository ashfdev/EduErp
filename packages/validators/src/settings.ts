import { z } from "zod";
import { AuthorityRole, DocumentType, PromotionAttendanceMode, StudentLeaveApprovalMode, UserRole } from "@education-erp/types";
import { passwordSchema } from "./auth";

export const institutionTypeSchema = z.enum(["SCHOOL", "COLLEGE", "UNIVERSITY", "MADRASAH"]);

export const institutionProfileSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  tagline_en: z.string().optional().nullable(),
  tagline_bn: z.string().optional().nullable(),
  type: institutionTypeSchema,
  eiin: z.string().optional().nullable(),
  board: z.string().optional().nullable(),
  founded_year: z.number().int().optional().nullable(),
  address: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  division: z.string().optional().nullable(),
  post_code: z.string().optional().nullable(),
  phone_primary: z.string().optional().nullable(),
  phone_secondary: z.string().optional().nullable(),
  email_primary: z.string().email().optional().nullable(),
  email_secondary: z.string().email().optional().nullable(),
  website_url: z.string().url().optional().nullable(),
  facebook_url: z.string().url().optional().nullable(),
  youtube_url: z.string().url().optional().nullable(),
  student_login_bg_url: z.string().url().optional().nullable(),
  teacher_login_bg_url: z.string().url().optional().nullable(),
  map_embed_code: z.string().optional().nullable(),
  principal_name: z.string().optional().nullable(),
  principal_designation: z.string().optional().nullable(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  established_text: z.string().optional().nullable(),
  mission_text: z.string().optional().nullable(),
  vision_text: z.string().optional().nullable(),
});
export type InstitutionProfileInput = z.infer<typeof institutionProfileSchema>;

export const institutionConfigSchema = z.object({
  academic_calendar_type: z.enum(["YEARLY", "SEMESTER", "TRIMESTER"]).optional(),
  has_shifts: z.boolean().optional(),
  has_sections: z.boolean().optional(),
  has_departments: z.boolean().optional(),
  has_semesters: z.boolean().optional(),
  show_hijri_calendar: z.boolean().optional(),
  term_class: z.string().optional(),
  term_section: z.string().optional(),
  term_teacher: z.string().optional(),
  term_principal: z.string().optional(),
  term_exam_controller: z.string().optional(),
  term_student_id: z.string().optional(),
  term_roll: z.string().optional(),
  term_registration: z.string().optional(),
  extra_course_enrollment: z.boolean().optional(),
  show_practical_marks: z.boolean().optional(),
  show_subject_teacher_on_result: z.boolean().optional(),
  allow_partial_fee_payment: z.boolean().optional(),
  show_position_in_result: z.boolean().optional(),
  show_class_position: z.boolean().optional(),
  show_section_position: z.boolean().optional(),
  fourth_subject_rule: z.boolean().optional(),
});

export const studentIdConfigSchema = z.object({
  prefix: z.string().min(1).max(10),
  include_year: z.boolean(),
  year_format: z.enum(["2", "4"]),
  include_month: z.boolean(),
  separator: z.enum(["-", "/", ""]),
  sequence_digits: z.number().int().min(3).max(6),
  sequence_scope: z.enum(["GLOBAL", "YEARLY", "CLASS"]),
});
export type StudentIdConfigInput = z.infer<typeof studentIdConfigSchema>;

export const gradeRangeSchema = z.object({
  min_marks: z.number().min(0).max(100),
  max_marks: z.number().min(0).max(100),
  grade_letter: z.string().min(1),
  grade_point: z.number().min(0),
  remarks: z.string().optional().nullable(),
  display_order: z.number().int(),
});

export const gradingScaleSchema = z.object({
  name: z.string().min(1),
  scale_type: z.enum(["GPA_5", "GPA_4", "PERCENTAGE", "CUSTOM"]),
  ranges: z.array(gradeRangeSchema).min(1),
});
export type GradingScaleInput = z.infer<typeof gradingScaleSchema>;

// One row of a standalone, reusable Mark Composition Template (e.g. "SSC
// Standard" = Theory 70/MCQ 20/Practical 10) — picked by name when
// configuring a subject's mark composition for a specific exam, pre-filling
// the draft (still adjustable before saving). source_type is deliberately
// restricted to MANUAL/ATTENDANCE_PERCENTAGE — a reusable template
// reapplied to a different exam/year must never silently point at a stale,
// specific past exam, so AVERAGE_OF_EXAMS (which needs concrete exam ids)
// is only ever configured directly on a real exam's mark component, never
// pre-filled from a template.
export const markCompositionTemplateItemSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
  label: z.string().min(1).max(100),
  max_marks: z.number().min(0),
  source_type: z.enum(["MANUAL", "ATTENDANCE_PERCENTAGE"]),
  display_order: z.number().int().min(0).optional(),
});
export type MarkCompositionTemplateItemInput = z.infer<typeof markCompositionTemplateItemSchema>;

export const markCompositionTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  items: z.array(markCompositionTemplateItemSchema).max(20),
});
export type MarkCompositionTemplateInput = z.infer<typeof markCompositionTemplateSchema>;

export const feeRulesSchema = z.object({
  late_fee_enabled: z.boolean(),
  late_fee_type: z.enum(["FIXED", "PERCENTAGE", "DAILY"]),
  late_fee_amount: z.number().min(0),
  // A cap of 0 previously validated fine but silently zeroed every late
  // fee at calculation time (Math.min(fine, 0) === 0) with no warning —
  // to actually disable late fees, use the separate late_fee_enabled
  // toggle instead of setting this to 0.
  late_fee_daily_cap: z.number().min(1),
  grace_period_days: z.number().int().min(0),
  fine_applies_to_exam_fee: z.boolean(),
  block_result_on_due: z.boolean(),
  block_admit_on_due: z.boolean(),
  partial_payment_allowed: z.boolean(),
  advance_payment_allowed: z.boolean(),
});
export type FeeRulesInput = z.infer<typeof feeRulesSchema>;

export const attendanceRulesSchema = z.object({
  min_attendance_percentage: z.number().min(0).max(100),
  late_arrival_window_minutes: z.number().int().min(0),
  working_days_per_week: z.number().int().min(1).max(7),
  // Which JS Date.getDay() values (0=Sun..6=Sat) are actual working days —
  // e.g. [0,1,2,3,4,6] for a Sat-Thu week with Friday off. Nullable; the
  // routine generator falls back to the Sat-Thu default when unset.
  working_days: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  count_late_as_absent_after: z.number().int().min(1),
  sms_on_absent: z.boolean(),
  sms_on_late: z.boolean(),
  promotion_attendance_mode: z.nativeEnum(PromotionAttendanceMode).optional(),
  promotion_min_sessions_per_subject: z.number().int().min(1).optional(),
  leave_approval_mode: z.nativeEnum(StudentLeaveApprovalMode).optional(),
  // Subject-wise pass-rate (%) at/above which the exam results page shows a
  // "good" badge instead of "needs attention". Was a hardcoded `>= 80`.
  pass_rate_alert_threshold: z.number().min(0).max(100).optional(),
});
export type AttendanceRulesInput = z.infer<typeof attendanceRulesSchema>;

export const authoritySignatureSchema = z.object({
  role: z.nativeEnum(AuthorityRole),
  display_name: z.string().min(1),
  designation: z.string().min(1),
  is_active: z.boolean().optional(),
});

export const authorityConfigSlotSchema = z.object({
  doc_type: z.nativeEnum(DocumentType),
  slot: z.number().int().min(1).max(3),
  label: z.string().min(1),
  authority_role: z.nativeEnum(AuthorityRole),
  is_required: z.boolean(),
});

export const documentTemplateSchema = z.object({
  doc_type: z.nativeEnum(DocumentType),
  name: z.string().min(1),
  html_content: z.string().min(1),
  css_content: z.string().optional().nullable(),
});

export const notificationConfigUpdateSchema = z.object({
  is_enabled: z.boolean(),
  template_bn: z.string().min(1),
  template_en: z.string().min(1),
  // EMAIL subject / PUSH title override. Empty string/omitted => service
  // falls back to its built-in default for the trigger.
  subject: z.string().max(200).optional().nullable(),
});

export const academicYearSchema = z.object({
  label: z.string().min(1),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
});

export const shiftSchema = z.object({
  name: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

export const shiftPeriodSchema = z.object({
  period_no: z.number().int().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_break: z.boolean().optional(),
});

export const departmentSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  code: z.string().min(1),
});

export const classSchema = z.object({
  academic_year_id: z.string().min(1),
  department_id: z.string().optional().nullable(),
  program_id: z.string().optional().nullable(),
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  numeric_level: z.number().int(),
});

export const sectionSchema = z.object({
  shift_id: z.string().optional().nullable(),
  name: z.string().min(1),
  capacity: z.number().int().min(1).optional(),
});

export const groupSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  code: z.string().min(1),
  display_order: z.number().int().optional(),
});

export const routineSlotSchema = z.object({
  class_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  day_of_week: z.number().int().min(0).max(6),
  period_no: z.number().int().min(1),
  subject_id: z.string().optional().nullable(),
  teacher_id: z.string().optional().nullable(),
  // null = applies to every group in this class — see RoutineSlot.group_id.
  group_id: z.string().optional().nullable(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

export const routineSubstitutionSchema = z.object({
  routine_slot_id: z.string().min(1),
  date: z.coerce.date(),
  substitute_teacher_id: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export const generateRoutineSchema = z.object({
  scope: z.enum(["CLASS", "CAMPUS"]),
  class_id: z.string().optional(),
}).refine((v) => v.scope === "CAMPUS" || !!v.class_id, {
  message: "class_id is required when scope is CLASS",
  path: ["class_id"],
});

export const createUserSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  phone: z.string().regex(/^01\d{9}$/),
  email: z.string().email().optional().nullable(),
  role: z.nativeEnum(UserRole),
  designation: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  // Optional — leave blank to auto-generate a memorable name+phone-derived
  // temp password; set explicitly to choose the account's initial password
  // instead. Either way must_change_password still forces a real,
  // self-chosen password on first login.
  login_password: passwordSchema.optional(),
});

export const adminResetPasswordSchema = z.object({
  login_password: passwordSchema.optional(),
});

// Every field is optional -- an omitted/blank credential field means "leave
// the stored value unchanged", never "clear it" (Plan Fourteen, Phase D2).
export const paymentGatewayConfigSchema = z.object({
  app_key: z.string().optional(),
  app_secret: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  sandbox_mode: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
export type PaymentGatewayConfigInput = z.infer<typeof paymentGatewayConfigSchema>;

export const smsGatewayConfigSchema = z.object({
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  sender_id: z.string().optional(),
  api_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});
export type SmsGatewayConfigInput = z.infer<typeof smsGatewayConfigSchema>;
