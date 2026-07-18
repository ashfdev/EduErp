import { z } from "zod";

export const programSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  code: z.string().min(1),
  department_id: z.string().optional().nullable(),
  duration_semesters: z.number().int().min(1),
  total_credit_hours: z.number().min(0),
  max_credit_hours_per_semester: z.number().min(0).optional().nullable(),
  degree_level: z.enum(["UNDERGRADUATE", "GRADUATE", "PHD"]).default("UNDERGRADUATE"),
});
export type ProgramInput = z.infer<typeof programSchema>;

export const courseSchema = z.object({
  program_id: z.string().min(1),
  semester_number: z.number().int().min(1),
  code: z.string().min(1),
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  credit_hours: z.number().min(0),
  course_type: z.enum(["THEORY", "PRACTICAL", "BOTH"]).default("THEORY"),
});
export type CourseInput = z.infer<typeof courseSchema>;

export const prerequisiteSchema = z.object({
  prerequisite_course_id: z.string().min(1),
});

export const courseEnrollSchema = z.object({
  student_id: z.string().min(1),
  course_id: z.string().min(1),
  class_id: z.string().min(1),
  academic_year_id: z.string().min(1),
  override: z.boolean().optional(),
});
export type CourseEnrollInput = z.infer<typeof courseEnrollSchema>;

export const submitCourseGradeSchema = z.object({
  marks_total: z.number().min(0).optional().nullable(),
  status: z.enum(["ENROLLED", "COMPLETED", "FAILED", "DROPPED", "WITHDRAWN"]).optional(),
});
export type SubmitCourseGradeInput = z.infer<typeof submitCourseGradeSchema>;
