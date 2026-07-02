import { z } from "zod";

const formFieldSchema = z.object({
  key: z.string().min(1),
  label_en: z.string().min(1),
  label_bn: z.string().optional(),
  type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "PHONE", "EMAIL", "TEXTAREA", "FILE"]),
  required: z.boolean().default(false),
  is_default: z.boolean().default(false),
  display_order: z.number().int().default(0),
  options: z.array(z.string()).optional(),
});

export const admissionFormConfigSchema = z.object({
  fields: z.array(formFieldSchema).default([]),
  subject_config: z
    .object({
      show_compulsory: z.boolean().default(true),
      show_optional: z.boolean().default(true),
      allow_selection: z.boolean().default(true),
    })
    .default({ show_compulsory: true, show_optional: true, allow_selection: true }),
  document_uploads: z.array(z.object({ key: z.string().min(1), label_en: z.string().min(1), required: z.boolean().default(false) })).default([]),
});
export type AdmissionFormConfigInput = z.infer<typeof admissionFormConfigSchema>;

export const createAdmissionCycleSchema = z.object({
  class_id: z.string().min(1),
  academic_year_id: z.string().min(1),
  name: z.string().min(1),
  open_date: z.coerce.date(),
  close_date: z.coerce.date(),
  seat_count: z.number().int().min(1),
  app_fee: z.number().min(0).default(0),
  form_config: admissionFormConfigSchema.optional(),
});
export type CreateAdmissionCycleInput = z.infer<typeof createAdmissionCycleSchema>;

export const updateAdmissionCycleSchema = createAdmissionCycleSchema.partial();

export const toggleAdmissionCycleSchema = z.object({
  is_open: z.boolean().optional(),
  is_published: z.boolean().optional(),
});

export const submitAdmissionApplicationSchema = z.object({
  cycle_id: z.string().min(1),
  applicant_name: z.string().min(1),
  guardian_info: z.object({
    father_name: z.string().optional(),
    mother_name: z.string().optional(),
    phone: z.string().regex(/^01\d{9}$/, "phone must be 11 digits starting with 01"),
    email: z.string().email().optional(),
    address: z.string().optional(),
  }),
  personal_info: z.record(z.string(), z.any()).default({}),
  previous_result: z
    .object({
      institution: z.string().optional(),
      class_passed: z.string().optional(),
      gpa: z.number().min(0).max(5).optional(),
      total_marks: z.number().optional(),
    })
    .optional(),
  selected_subjects: z.array(z.string()).optional(),
  documents: z.record(z.string(), z.string()).optional(),
});
export type SubmitAdmissionApplicationInput = z.infer<typeof submitAdmissionApplicationSchema>;

export const admissionApplicationStatusSchema = z.object({
  status: z.enum(["SHORTLISTED", "WAITLISTED", "REJECTED"]),
  notes: z.string().optional(),
});

export const admissionBulkActionSchema = z.object({
  application_ids: z.array(z.string().min(1)).min(1),
  status: z.enum(["SHORTLISTED", "WAITLISTED", "REJECTED"]),
});

export const admissionEnrollSchema = z.object({
  section_id: z.string().optional(),
  roll_no: z.string().optional(),
});

export const admissionPaymentInitiateSchema = z.object({
  application_id: z.string().min(1),
  gateway: z.enum(["BKASH", "NAGAD", "SSLCOMMERZ"]),
});

export const admissionStatusLookupSchema = z.object({
  application_id: z.string().min(1),
  phone: z.string().regex(/^01\d{9}$/, "phone must be 11 digits starting with 01"),
});
