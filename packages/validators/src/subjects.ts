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
});
export type SubjectInput = z.infer<typeof subjectSchema>;

export const subjectAssignmentSchema = z.object({
  subject_id: z.string().min(1),
  staff_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  academic_year_id: z.string().min(1),
});
