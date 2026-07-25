import { z } from "zod";
import { passwordSchema } from "./auth";

export const createStaffSchema = z.object({
  name_en: z.string().min(1),
  name_bn: z.string().optional(),
  designation: z.string().min(1),
  department_id: z.string().optional().nullable(),
  program_id: z.string().optional().nullable(),
  date_of_birth: z.coerce.date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  religion: z.string().optional(),
  blood_group: z.string().optional(),
  nid: z.string().optional(),
  tin: z.string().optional(),
  phone: z.string().regex(/^01\d{9}$/, "phone must be 11 digits starting with 01").optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  address_house_name: z.string().optional(),
  address_village: z.string().optional(),
  address_post_code: z.string().optional(),
  address_district: z.string().optional(),
  address_division: z.string().optional(),
  photo_url: z.string().url().optional().nullable(),
  employment_type: z.enum(["PERMANENT", "CONTRACT", "PART_TIME"]).default("PERMANENT"),
  joining_date: z.coerce.date().optional(),
  biometric_id: z.string().optional(),
  max_periods_per_day: z.number().int().min(1).optional().nullable(),
  max_periods_per_week: z.number().int().min(1).optional().nullable(),
  role: z.string().min(1).default("SUBJECT_TEACHER"),
  show_on_website: z.boolean().default(false),
  qualifications: z.string().optional().nullable(),
  achievements: z.string().optional().nullable(),
  publications: z.array(z.object({ title: z.string().min(1), url: z.string().url() })).optional().nullable(),
  public_contact_email: z.string().email().optional().nullable(),
  public_office_location: z.string().optional().nullable(),
  create_login: z.boolean().default(false),
  // Optional — leave blank to auto-generate a memorable name+phone-derived
  // temp password when create_login is true; set explicitly to choose it
  // instead. Ignored when create_login is false.
  login_password: passwordSchema.optional(),
  salary_structure_id: z.string().optional().nullable(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

// salary_structure_id deliberately omitted here — creation-time assignment
// only (HR_MANAGE_ROLES, which includes PRINCIPAL) via createStaffSchema;
// changing it after creation must go through the dedicated PUT
// /:id/salary-structure route, which is PAYROLL_MANAGE_ROLES-only (narrower
// — excludes PRINCIPAL). Letting it through this general update schema would
// silently let PRINCIPAL bypass that restriction via PUT /:id.
export const updateStaffSchema = createStaffSchema.partial().omit({ create_login: true, role: true, login_password: true, salary_structure_id: true });

export const staffDocumentSchema = z.object({
  doc_type: z.enum(["CERTIFICATE", "NID", "TIN", "CONTRACT", "OTHER"]),
  title: z.string().min(1),
});

export const staffExperienceSchema = z.object({
  institution_name: z.string().min(1),
  designation: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  responsibility: z.string().optional().nullable(),
  start_date: z.coerce.date().optional().nullable(),
  end_date: z.coerce.date().optional().nullable(),
});

export const staffReferenceSchema = z.object({
  name: z.string().min(1),
  designation: z.string().optional().nullable(),
  relation: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export const staffResignSchema = z.object({
  resignation_date: z.coerce.date(),
  resignation_reason: z.string().min(1),
});

export const staffRejoinSchema = z.object({
  rejoin_date: z.coerce.date(),
});

export const leaveTypeSchema = z.object({
  name: z.string().min(1),
  days_allowed: z.number().int().min(0),
  is_paid: z.boolean().default(true),
});

export const applyLeaveSchema = z.object({
  staff_id: z.string().min(1),
  leave_type_id: z.string().min(1),
  from_date: z.coerce.date(),
  to_date: z.coerce.date(),
  reason: z.string().min(1),
});

export const rejectLeaveSchema = z.object({
  reason: z.string().min(1),
});

export const salaryStructureSchema = z.object({
  name: z.string().min(1),
  basic: z.number().min(0),
  house_rent: z.number().min(0).default(0),
  medical: z.number().min(0).default(0),
  transport: z.number().min(0).default(0),
  pf_percentage: z.number().min(0).max(100).default(0),
  tds_percentage: z.number().min(0).max(100).default(0),
  is_default: z.boolean().default(false),
});

export const assignSalaryStructureSchema = z.object({
  salary_structure_id: z.string().min(1),
});

export const bulkAssignSalaryStructureSchema = z.object({
  staff_ids: z.array(z.string().min(1)).min(1),
  salary_structure_id: z.string().min(1),
});

export const calculatePayrollSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
  department_id: z.string().optional().nullable(),
});

export const updatePayrollSchema = z.object({
  gross_salary: z.number().min(0).optional(),
  deductions: z.number().min(0).optional(),
  advance_deducted: z.number().min(0).optional(),
});

export const finalizePayrollSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
});

export const markPaidSchema = z.object({
  payroll_ids: z.array(z.string().min(1)).min(1),
});

export const jobPostingSchema = z.object({
  title: z.string().min(1),
  department: z.string().optional(),
  description: z.string().min(1),
  requirements: z.string().optional(),
  deadline: z.coerce.date().optional().nullable(),
});

export const jobApplicationSchema = z.object({
  applicant_name: z.string().min(1),
  phone: z.string().regex(/^01\d{9}$/),
  email: z.string().email().optional().nullable(),
  cv_blob_key: z.string().min(1),
  cover_note: z.string().optional().nullable(),
});

export const jobApplicationStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "SHORTLISTED", "REJECTED", "HIRED"]),
});
