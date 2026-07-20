import { z } from "zod";

export const createStudentSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  date_of_birth: z.coerce.date().optional().nullable(),
  religion: z.string().optional().nullable(),
  blood_group: z.string().optional().nullable(),
  nid_or_birth_reg: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  has_disability: z.boolean().optional(),
  disability_note: z.string().optional().nullable(),
  address_permanent: z.string().optional().nullable(),
  address_current: z.string().optional().nullable(),
  district: z.string().optional().nullable(),

  guardian_id: z.string().optional().nullable(),
  father_name: z.string().optional().nullable(),
  father_phone: z.string().regex(/^01\d{9}$/, "Father's phone must be 11 digits starting with 01"),
  father_nid: z.string().optional().nullable(),
  father_occupation: z.string().optional().nullable(),
  mother_name: z.string().optional().nullable(),
  mother_phone: z.string().optional().nullable(),
  mother_nid: z.string().optional().nullable(),
  mother_occupation: z.string().optional().nullable(),

  current_class_id: z.string().min(1, "Class is required"),
  current_section_id: z.string().optional().nullable(),
  group_id: z.string().optional().nullable(),
  current_roll_no: z.string().optional().nullable(),
  registration_no: z.string().optional().nullable(),
  board_roll: z.string().optional().nullable(),
  biometric_id: z.string().optional().nullable(),
  academic_year_id: z.string().min(1, "Academic year is required"),
  admission_date: z.coerce.date().optional().nullable(),
  previous_institution: z.string().optional().nullable(),
  previous_class: z.string().optional().nullable(),
  previous_result: z.string().optional().nullable(),

  selected_optional_subject_ids: z.array(z.string()).optional(),
  send_portal_login_sms: z.boolean().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().omit({ academic_year_id: true });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const promoteStudentSchema = z.object({
  new_class_id: z.string().min(1),
  new_section_id: z.string().optional().nullable(),
  new_group_id: z.string().optional().nullable(),
  new_academic_year_id: z.string().min(1),
  new_roll_no: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type PromoteStudentInput = z.infer<typeof promoteStudentSchema>;

export const graduateStudentSchema = z.object({
  graduation_year: z.number().int().min(2000).max(2100),
  notes: z.string().optional().nullable(),
});
export type GraduateStudentInput = z.infer<typeof graduateStudentSchema>;

// Shared by both POST /:id/transfer and POST /:id/expel — same shape, same
// mechanics (record history, deactivate login), just a different reason a
// student is leaving. Kept as one schema since the two routes' bodies never
// need to diverge.
export const deactivateStudentSchema = z.object({
  reason: z.string().optional().nullable(),
  effective_date: z.coerce.date().optional(),
});
export type DeactivateStudentInput = z.infer<typeof deactivateStudentSchema>;

export const bulkPromoteSchema = z.object({
  class_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  new_class_id: z.string().min(1),
  new_section_id: z.string().optional().nullable(),
  new_academic_year_id: z.string().min(1),
  student_ids: z.array(z.string()).min(1),
  // Only required when new_class_id defines Groups — one destination class,
  // but each student may need a different group, so this is a per-student
  // map rather than one group_id for the whole batch.
  student_group_ids: z.record(z.string(), z.string()).optional(),
});
export type BulkPromoteInput = z.infer<typeof bulkPromoteSchema>;
