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
  new_academic_year_id: z.string().min(1),
  new_roll_no: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type PromoteStudentInput = z.infer<typeof promoteStudentSchema>;

export const bulkPromoteSchema = z.object({
  class_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  new_class_id: z.string().min(1),
  new_section_id: z.string().optional().nullable(),
  new_academic_year_id: z.string().min(1),
  student_ids: z.array(z.string()).min(1),
});
export type BulkPromoteInput = z.infer<typeof bulkPromoteSchema>;
