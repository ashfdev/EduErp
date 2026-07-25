import { z } from "zod";

export const createExamSchema = z.object({
  name: z.string().min(1),
  exam_type_config_id: z.string().min(1),
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

export const markComponentConfigSchema = z.object({
  components: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
        label: z.string().min(1).max(100),
        max_marks: z.number().min(0),
        display_order: z.number().int().min(0).optional(),
      }),
    )
    .max(20),
});
export type MarkComponentConfigInput = z.infer<typeof markComponentConfigSchema>;

export const submitMarksSchema = z.object({
  exam_id: z.string().min(1),
  entries: z.array(
    z.object({
      student_id: z.string().min(1),
      subject_id: z.string().min(1),
      marks_theory: z.number().min(0).optional().nullable(),
      marks_practical: z.number().min(0).optional().nullable(),
      component_marks: z.record(z.string(), z.number().min(0)).optional(),
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
