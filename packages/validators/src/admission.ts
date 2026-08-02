import { z } from "zod";

// A blank Email field on the public apply wizard sends "" (never undefined) --
// which fails z.string().email().optional()'s own format check even though
// email itself isn't required. Same bug class already fixed once in
// hr/staff.routes.ts's bulk-import; this normalizes the empty-string case
// to undefined before it ever reaches the format check.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

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
  form_fee: z.number().min(0).default(0),
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
    email: z.preprocess(emptyToUndefined, z.string().email().optional()),
    address: z.string().optional(),
  }),
  personal_info: z.record(z.string(), z.any()).default({}),
  previous_result: z
    .object({
      institution: z.string().optional(),
      class_passed: z.string().optional(),
      gpa: z.number().min(0).optional(),
      gpa_scale: z.enum(["5", "4", "OTHER"]).default("5"),
      marks_obtained: z.number().optional(),
      marks_total_out_of: z.number().optional(),
    })
    .optional(),
  selected_subjects: z.array(z.string()).optional(),
  // Legacy shape (a bare {key:url} map) kept accepted here too -- old,
  // already-deployed frontend builds mid-rollout would otherwise 400 with
  // no warning. New submissions use the richer array shape below instead.
  documents: z.record(z.string(), z.string()).optional(),
  photo_url: z.string().url().optional(),
  identity_type: z.enum(["BIRTH_CERTIFICATE", "NID"]).optional(),
  uploaded_documents: z
    .array(
      z.object({
        doc_type: z.enum(["BIRTH_CERTIFICATE", "NID", "MARKSHEET", "TESTIMONIAL", "TRANSFER_CERTIFICATE", "OTHER"]),
        slot: z.enum(["FRONT", "BACK"]).optional(),
        blob_key: z.string().min(1),
        original_filename: z.string().min(1),
        mime_type: z.string().min(1),
        label_key: z.string().optional(),
      }),
    )
    .default([]),
});
export type SubmitAdmissionApplicationInput = z.infer<typeof submitAdmissionApplicationSchema>;

// CONFIRMED is a legal target here now -- previously excluded, which made
// ALLOWED_STATUS_TRANSITIONS' own CONFIRMED entries structurally
// unreachable through this route (Plan Twenty-Three, Phase 1).
export const admissionApplicationStatusSchema = z.object({
  status: z.enum(["SHORTLISTED", "WAITLISTED", "REJECTED", "CONFIRMED"]),
  notes: z.string().optional(),
});

export const admissionBulkActionSchema = z.object({
  application_ids: z.array(z.string().min(1)).min(1),
  status: z.enum(["SHORTLISTED", "WAITLISTED", "REJECTED", "CONFIRMED"]),
});

export const admissionNotesSchema = z.object({
  notes: z.string(),
});

export const admissionEnrollSchema = z.object({
  section_id: z.string().optional(),
  roll_no: z.string().optional(),
  group_id: z.string().optional(),
});

export const admissionStatusLookupSchema = z.object({
  admission_roll: z.string().min(1),
  phone: z.string().regex(/^01\d{9}$/, "phone must be 11 digits starting with 01"),
});

// Plan Twenty-Three Phase 3 -- replaces the old application_id-only
// admissionPaymentInitiateSchema (no identity check at all, just a raw
// cuid). Every public payment route is now keyed by admission_roll+phone,
// same identity pair used everywhere else on the status-check page, and
// scoped to one specific invoice (a cycle can have both an ADMISSION and a
// FORM invoice, paid independently -- mirrors portalPaySchema's own
// invoice_id+gateway shape).
export const admissionPaymentGatewaySchema = z.object({
  admission_roll: z.string().min(1),
  phone: z.string().regex(/^01\d{9}$/, "phone must be 11 digits starting with 01"),
  invoice_id: z.string().min(1),
  gateway: z.enum(["BKASH", "NAGAD", "SSLCOMMERZ", "ROCKET"]),
});

// Self-reported manual payment -- the payer sends money via the
// institution's published bKash/Nagad/Rocket number (or bank account) and
// enters the transaction ID here, exactly mirroring the standard BD
// mobile-banking "Send Money, report the TrxID" pattern. Always lands as
// Payment(INITIATED), awaiting staff verification via the same manual
// verification queue bank-transfer slips already use.
export const admissionPaymentManualSchema = z.object({
  admission_roll: z.string().min(1),
  phone: z.string().regex(/^01\d{9}$/, "phone must be 11 digits starting with 01"),
  invoice_id: z.string().min(1),
  gateway: z.enum(["BKASH", "NAGAD", "ROCKET", "BANK_TRANSFER"]),
  transaction_id: z.string().min(1),
  amount: z.number().positive(),
});

export const scheduleAdmissionTestSchema = z.object({
  requires_test: z.boolean(),
  test_date: z.coerce.date().optional(),
  test_venue: z.string().optional(),
  test_duration_minutes: z.number().int().min(1).optional(),
  test_instructions: z.string().optional(),
});
export type ScheduleAdmissionTestInput = z.infer<typeof scheduleAdmissionTestSchema>;

// Admin-editable manual payment instructions (Settings -> Admission ->
// Payment Instructions), shown on the public payment flow. Every field
// optional -- a cycle's app_fee/form_fee can be nonzero before an admin has
// ever filled this in, so the payment-info response must degrade
// gracefully (no manual-pay numbers shown yet) rather than require it.
export const admissionPaymentInstructionsSchema = z.object({
  bkash_number: z.string().optional().nullable(),
  nagad_number: z.string().optional().nullable(),
  rocket_number: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  bank_account_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
  bank_routing_number: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});
export type AdmissionPaymentInstructionsInput = z.infer<typeof admissionPaymentInstructionsSchema>;

export const generateTestSeatPlanSchema = z.object({
  statuses: z.array(z.enum(["SHORTLISTED", "WAITLISTED"])).min(1),
  halls: z.array(z.object({ name: z.string().min(1), capacity: z.number().int().min(1) })).min(1),
  start_seat: z.number().int().min(1).default(1),
});
export type GenerateTestSeatPlanInput = z.infer<typeof generateTestSeatPlanSchema>;
