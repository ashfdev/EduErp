import { z } from "zod";
import { AuthorityRole, DocumentType, UserRole } from "@education-erp/types";

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

export const examTypeConfigSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  weight_in_annual: z.number().min(0).max(100),
  allows_absent_marking: z.boolean(),
  has_practical: z.boolean(),
  has_viva: z.boolean(),
  practical_marks_separate: z.boolean(),
  is_board_exam: z.boolean(),
  display_order: z.number().int(),
});

export const feeRulesSchema = z.object({
  late_fee_enabled: z.boolean(),
  late_fee_type: z.enum(["FIXED", "PERCENTAGE", "DAILY"]),
  late_fee_amount: z.number().min(0),
  late_fee_daily_cap: z.number().min(0),
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
  count_late_as_absent_after: z.number().int().min(1),
  sms_on_absent: z.boolean(),
  sms_on_late: z.boolean(),
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

export const departmentSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  code: z.string().min(1),
});

export const classSchema = z.object({
  academic_year_id: z.string().min(1),
  department_id: z.string().optional().nullable(),
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  numeric_level: z.number().int(),
});

export const sectionSchema = z.object({
  shift_id: z.string().optional().nullable(),
  name: z.string().min(1),
  capacity: z.number().int().min(1).optional(),
});

export const createUserSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  phone: z.string().regex(/^01\d{9}$/),
  email: z.string().email().optional().nullable(),
  role: z.nativeEnum(UserRole),
  designation: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
});
