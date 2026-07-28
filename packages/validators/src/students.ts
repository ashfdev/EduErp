import { z } from "zod";

export const createStudentSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional().nullable(),
  middle_name: z.string().optional().nullable(),
  nick_name: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  date_of_birth: z.coerce.date().optional().nullable(),
  religion: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  blood_group: z.string().optional().nullable(),
  nid_or_birth_reg: z.string().optional().nullable(),
  passport_no: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  other_phone: z.string().optional().nullable(),
  has_disability: z.boolean().optional(),
  disability_note: z.string().optional().nullable(),
  // Mandatory (Plan Thirteen, Phase N) — collected in the New Student
  // wizard's first step via a pre-creation upload (POST /api/students/photo).
  photo_url: z.string().url(),
  // "Present Address" in the UI (Plan Thirteen, Phase C) -- the field name
  // stays address_current to match the already-existing DB column, which
  // predates the UI split and was never wired in before this. Kept as a
  // supplementary Road/Area free-text line alongside the structured fields
  // below (Phase N), not replaced.
  address_current: z.string().optional().nullable(),
  address_permanent: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  // Structured Present/Permanent address (Plan Thirteen, Phase N) — all
  // mandatory per the owner's explicit ask.
  present_house_name: z.string().min(1, "House name is required"),
  present_village: z.string().min(1, "Village is required"),
  present_post_code: z.string().min(1, "Post code is required"),
  present_district: z.string().min(1, "District is required"),
  present_division: z.string().min(1, "Division is required"),
  permanent_house_name: z.string().min(1, "House name is required"),
  permanent_village: z.string().min(1, "Village is required"),
  permanent_post_code: z.string().min(1, "Post code is required"),
  permanent_district: z.string().min(1, "District is required"),
  permanent_division: z.string().min(1, "Division is required"),

  guardian_id: z.string().optional().nullable(),
  // Both parents' name/phone/NID/occupation are mandatory (Plan Thirteen,
  // Phase N, per the owner's explicit ask) — father_nid/mother_nid already
  // existed on the Student model but had no UI/validator wiring before this.
  father_name: z.string().min(1, "Father's name is required"),
  father_phone: z.string().regex(/^01\d{9}$/, "Father's phone must be 11 digits starting with 01"),
  father_nid: z.string().min(1, "Father's NID is required"),
  father_occupation: z.string().min(1, "Father's occupation is required"),
  // Optional (Plan Fourteen, Phase B3) — explicitly not mandatory, unlike
  // the student's own photo_url above.
  father_photo_url: z.string().url().optional().nullable(),
  mother_name: z.string().min(1, "Mother's name is required"),
  mother_phone: z.string().regex(/^01\d{9}$/, "Mother's phone must be 11 digits starting with 01"),
  mother_nid: z.string().min(1, "Mother's NID is required"),
  mother_occupation: z.string().min(1, "Mother's occupation is required"),
  mother_photo_url: z.string().url().optional().nullable(),

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
  // The BD "4th subject" GPA-bonus pick — must be one of
  // selected_optional_subject_ids when provided (checked server-side, not
  // just here, since this schema alone can't cross-reference the sibling
  // field). undefined = not provided/unchanged; null = explicitly cleared.
  fourth_subject_id: z.string().optional().nullable(),
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

export const studentDocumentSchema = z.object({
  doc_type: z.enum([
    "BIRTH_CERTIFICATE",
    "TRANSFER_CERTIFICATE",
    "TESTIMONIAL",
    "ACADEMIC_CERTIFICATE",
    "MARKSHEET",
    "FATHER_NID",
    "MOTHER_NID",
    "OTHER",
  ]),
});
export type StudentDocumentInput = z.infer<typeof studentDocumentSchema>;

// Retroactively creates a portal login for a student who was created
// without one (e.g. no phone on file at admission time, or a guardian only
// asks for portal access later) -- phone is optional here specifically
// because the student may already have one on file (Student.phone); when
// omitted, the route falls back to that existing value and only errors if
// neither is present.
export const createStudentLoginSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/, "Phone must be 11 digits starting with 01").optional(),
  login_password: z.string().min(8).optional(),
});
export type CreateStudentLoginInput = z.infer<typeof createStudentLoginSchema>;
