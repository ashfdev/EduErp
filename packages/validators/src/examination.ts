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

export const submitMarksSchema = z.object({
  exam_id: z.string().min(1),
  entries: z.array(
    z.object({
      student_id: z.string().min(1),
      subject_id: z.string().min(1),
      marks_theory: z.number().min(0).optional().nullable(),
      marks_practical: z.number().min(0).optional().nullable(),
      is_absent: z.boolean().optional(),
    }),
  ),
});
export type SubmitMarksInput = z.infer<typeof submitMarksSchema>;
