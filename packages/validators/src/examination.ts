import { z } from "zod";

export const createExamSchema = z.object({
  name: z.string().min(1),
  academic_year_id: z.string().min(1),
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),
  mark_entry_opens_at: z.coerce.date().optional().nullable(),
  mark_entry_closes_at: z.coerce.date().optional().nullable(),
  grading_scale_id: z.string().optional().nullable(),
  class_ids: z.array(z.string()).min(1, "Select at least one class"),
});
export type CreateExamInput = z.infer<typeof createExamSchema>;

export const examStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "MARK_ENTRY", "COMPLETED", "PUBLISHED"]),
});

export const cloneExamSchema = z.object({
  name: z.string().min(1).optional(),
  academic_year_id: z.string().min(1),
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),
  mark_entry_opens_at: z.coerce.date().optional().nullable(),
  mark_entry_closes_at: z.coerce.date().optional().nullable(),
  class_ids: z.array(z.string()).min(1, "Select at least one class"),
});
export type CloneExamInput = z.infer<typeof cloneExamSchema>;

export const subjectConfigSchema = z.array(
  z.object({
    subject_id: z.string().min(1),
    full_marks_theory: z.number().min(0),
    full_marks_practical: z.number().min(0),
    pass_marks_theory: z.number().min(0),
    pass_marks_practical: z.number().min(0),
    pass_marks_combined: z.number().min(0),
  }),
);

export const seatPlanGenerateSchema = z.object({
  halls: z.array(z.object({ name: z.string().min(1), capacity: z.number().int().min(1) })).min(1),
});

export const examSessionSchema = z.object({
  label: z.string().min(1),
  date: z.coerce.date(),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  class_ids: z.array(z.string().min(1)).min(1, "Select at least one class"),
});
export type ExamSessionInput = z.infer<typeof examSessionSchema>;

// A single named, fixed-mark-value piece of a subject's total under one
// exam (e.g. Theory 60, MCQ 20, Practical 20, CT 10, Attendance 5) — plain
// peer parts, no derived "Main Exam" value, no percentage math anywhere.
// The full list for a subject must sum exactly to that subject's real total
// (enforced server-side, not here). source_exam_ids (one or more SPECIFIC
// exams to average from — never a category/type match) is only meaningful
// when source_type is AVERAGE_OF_EXAMS; enforced non-empty in that case via
// the refine below.
export const examMarkComponentSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
    label: z.string().min(1).max(100),
    max_marks: z.number().min(0),
    source_type: z.enum(["MANUAL", "ATTENDANCE_PERCENTAGE", "AVERAGE_OF_EXAMS"]),
    source_exam_ids: z.array(z.string()).optional(),
    display_order: z.number().int().min(0).optional(),
  })
  .refine((c) => c.source_type !== "AVERAGE_OF_EXAMS" || (c.source_exam_ids && c.source_exam_ids.length > 0), {
    message: "Must select at least one source exam to average from",
    path: ["source_exam_ids"],
  });
export type ExamMarkComponentInput = z.infer<typeof examMarkComponentSchema>;

export const examMarkComponentsSchema = z.array(examMarkComponentSchema).max(20);

export const bulkApplyMarkCompositionTemplateSchema = z.object({
  subject_ids: z.array(z.string().min(1)).min(1),
  template_id: z.string().min(1),
});
export type BulkApplyMarkCompositionTemplateInput = z.infer<typeof bulkApplyMarkCompositionTemplateSchema>;

export const submitMarksSchema = z.object({
  exam_id: z.string().min(1),
  entries: z.array(
    z.object({
      student_id: z.string().min(1),
      subject_id: z.string().min(1),
      marks_theory: z.number().min(0).optional().nullable(),
      marks_practical: z.number().min(0).optional().nullable(),
      // One entry per ExamMarkComponent key configured for this subject.
      // is_override is client-reported: true once the teacher has edited an
      // auto-fetched value away from its fetched default, so a later GET
      // knows to keep showing this value rather than recomputing a fresh
      // fetch over it.
      component_values: z.record(z.string(), z.object({ value: z.number().min(0).nullable(), is_override: z.boolean() })).optional(),
      is_absent: z.boolean().optional(),
    }),
  ),
});
export type SubmitMarksInput = z.infer<typeof submitMarksSchema>;

export const marksheetDisplaySettingsSchema = z.object({
  show_institute_banner: z.boolean(),
  show_qr_code: z.boolean(),
  show_general_ability_table: z.boolean(),
  show_student_image: z.boolean(),
  show_attendance_info: z.boolean(),
  show_subject_full_marks: z.boolean(),
  show_subject_pass_marks: z.boolean(),
  show_highest_in_class: z.boolean(),
  show_highest_in_section: z.boolean(),
  show_position_in_class: z.boolean(),
  show_position_in_section: z.boolean(),
  show_average_position: z.boolean(),
  show_average_percentage: z.boolean(),
  show_average_marks: z.boolean(),
  show_average_grade_point: z.boolean(),
  show_average_remarks: z.boolean(),
  show_published_date: z.boolean(),
  show_mark_composition: z.boolean(),
});
export type MarksheetDisplaySettingsInput = z.infer<typeof marksheetDisplaySettingsSchema>;

export const createMarkCorrectionRequestSchema = z.object({
  exam_id: z.string().min(1),
  subject_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  reason: z.string().min(1),
});
export type CreateMarkCorrectionRequestInput = z.infer<typeof createMarkCorrectionRequestSchema>;

export const approveMarkCorrectionSchema = z.object({
  expires_at: z.coerce.date().optional().nullable(),
  decision_note: z.string().optional(),
});

export const rejectMarkCorrectionSchema = z.object({
  decision_note: z.string().min(1),
});
