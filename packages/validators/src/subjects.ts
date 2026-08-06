import { z } from "zod";

export const subjectSchema = z.object({
  class_id: z.string().min(1),
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  code: z.string().min(1),
  subject_type: z.enum(["THEORY", "PRACTICAL", "BOTH"]),
  is_compulsory: z.boolean(),
  is_optional: z.boolean(),
  full_marks: z.number().min(0),
  pass_marks: z.number().min(0),
  display_order: z.number().int().optional(),
  weekly_periods: z.number().int().min(1).optional().nullable(),
  // null = applies to every group in this class (unchanged existing
  // behavior). Set only to restrict this subject to one Group/Stream.
  group_id: z.string().optional().nullable(),
  // Routine auto-generator flags (Plan Twenty-Five, Phase C3/C4) — both
  // default false, independent of each other.
  requires_lab: z.boolean().optional(),
  requires_double_period: z.boolean().optional(),
});
export type SubjectInput = z.infer<typeof subjectSchema>;

export const subjectAssignmentSchema = z.object({
  subject_id: z.string().min(1),
  staff_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  academic_year_id: z.string().min(1),
});
