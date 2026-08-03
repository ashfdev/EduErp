import { z } from "zod";

export const feeCategorySchema = z.enum([
  "ADMISSION", "FORM", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER",
]);

export const feeStructureSchema = z.object({
  academic_year_id: z.string().min(1),
  class_id: z.string().optional().nullable(),
  section_id: z.string().optional().nullable(),
  category: feeCategorySchema,
  fee_sub_category_id: z.string().optional().nullable(),
  name: z.string().min(1),
  amount: z.number().min(0),
  frequency: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
  due_day: z.number().int().min(1).max(28).optional().nullable(),
  target_due_date: z.coerce.date().optional().nullable(),
});
export type FeeStructureInput = z.infer<typeof feeStructureSchema>;

// Plan Fourteen, Phase N1 -- optional finer-grained catalog entry nested
// under a FeeCategory (e.g. TUITION -> "Lab Fee").
export const feeSubCategorySchema = z.object({
  category: feeCategorySchema,
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});
export type FeeSubCategoryInput = z.infer<typeof feeSubCategorySchema>;

// Plan Fourteen, Phase N2 -- category/sub-category/class-scoped fine engine.
export const feeFineRuleSchema = z.object({
  academic_year_id: z.string().min(1),
  scope_mode: z.enum(["CATEGORY_FINE", "SUB_CATEGORY_FINE"]),
  fee_category: feeCategorySchema,
  fee_sub_category_id: z.string().optional().nullable(),
  fine_value_type: z.enum(["FIXED", "PERCENTAGE"]),
  fine_value: z.number().min(0),
  applicable_for: z.enum(["ALL_CLASSES", "SPECIFIC_CLASSES"]).default("ALL_CLASSES"),
  class_ids: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional(),
});
export type FeeFineRuleInput = z.infer<typeof feeFineRuleSchema>;

// Plan Fourteen, Phase N3 -- full-replace multi-class assignment for a
// single FeeStructure. Each entry is a class, optionally narrowed to one
// Group within it (group_id omitted/null = the whole class, unchanged
// from before Group-level scoping existed).
export const assignFeeStructureClassesSchema = z.object({
  entries: z.array(z.object({ class_id: z.string().min(1), group_id: z.string().nullable().optional() })).min(1),
  override_overlap: z.boolean().optional(),
});
export type AssignFeeStructureClassesInput = z.infer<typeof assignFeeStructureClassesSchema>;

// Full-replace individual-student assignment for a single FeeStructure --
// separate from class/group scoping (additive on top of it), for the case
// where one specific student needs a fee attached regardless of their
// class (an extra elective, a one-off re-sit fee).
export const assignFeeStructureStudentsSchema = z.object({
  student_ids: z.array(z.string()),
});
export type AssignFeeStructureStudentsInput = z.infer<typeof assignFeeStructureStudentsSchema>;

export const generateInvoiceSchema = z.object({
  fee_structure_id: z.string().min(1),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().optional(),
  student_ids: z.array(z.string()).optional(),
  // Explicit override for a ONE_TIME fee (e.g. an exam fee) where "10th of
  // whichever month generation happens to run in" (the month/year+due_day
  // fallback below) isn't a meaningful deadline. Omitted -> byte-identical
  // to today's existing month/year/due_day computation.
  due_date: z.coerce.date().optional(),
});

export const generateBulkMonthlySchema = z.object({
  academic_year_id: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
});

// Manual/counter collection — staff is recording money already confirmed
// received, so this excludes SSLCOMMERZ/AAMARPAY (online-redirect-only
// aggregators with no real-world "staff manually confirms" scenario).
export const collectPaymentSchema = z.object({
  invoice_id: z.string().min(1),
  amount: z.number().min(0.01),
  gateway: z.enum(["CASH", "BANK_TRANSFER", "BKASH", "NAGAD", "ROCKET"]),
  notes: z.string().optional(),
});
export type CollectPaymentInput = z.infer<typeof collectPaymentSchema>;

export const waiveInvoiceSchema = z.object({
  reason: z.string().min(1),
});

export const waiverTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  discount_type: z.enum(["PERCENTAGE", "FIXED"]),
  discount_value: z.number().min(0),
  applicable_categories: z.array(feeCategorySchema).default([]),
  is_active: z.boolean().optional(),
});
export type WaiverTypeInput = z.infer<typeof waiverTypeSchema>;

export const assignStudentWaiverSchema = z.object({
  student_id: z.string().min(1),
  waiver_type_id: z.string().min(1),
  academic_year_id: z.string().optional().nullable(),
});
export type AssignStudentWaiverInput = z.infer<typeof assignStudentWaiverSchema>;

// Bulk variant -- same shape, a roster of students instead of one. Existing
// waiver-per-student rows already tolerate multiple independent waivers per
// student, so a student re-selected in a later bulk run just gets a second
// (still independently revocable) assignment rather than erroring.
export const assignStudentWaiverBulkSchema = z.object({
  student_ids: z.array(z.string()).min(1),
  waiver_type_id: z.string().min(1),
  academic_year_id: z.string().optional().nullable(),
});
export type AssignStudentWaiverBulkInput = z.infer<typeof assignStudentWaiverBulkSchema>;

// Student/guardian-submitted request for financial assistance -- just a
// reason, no waiver-type selection (the admin decides which template
// actually applies after reviewing the case, mirroring DocumentRequest's
// own "just a reason" simplicity).
export const createWaiverRequestSchema = z.object({
  reason: z.string().min(1),
});
export type CreateWaiverRequestInput = z.infer<typeof createWaiverRequestSchema>;

// Approving a request IS assigning the waiver -- same fields the direct
// assign flow needs, since this creates a real StudentWaiver in the same
// transaction that resolves the request.
export const approveWaiverRequestSchema = z.object({
  waiver_type_id: z.string().min(1),
  academic_year_id: z.string().optional().nullable(),
});
export type ApproveWaiverRequestInput = z.infer<typeof approveWaiverRequestSchema>;

export const rejectWaiverRequestSchema = z.object({
  rejection_reason: z.string().min(1),
});
export type RejectWaiverRequestInput = z.infer<typeof rejectWaiverRequestSchema>;

// Bulk ad-hoc fee/fine -- same shape as adHocInvoiceSchema below, applied to
// a roster of students at once (e.g. "fine every student in Class 9 who was
// late submitting a form ৳100").
export const adHocInvoiceBulkSchema = z.object({
  student_ids: z.array(z.string()).min(1),
  category: feeCategorySchema,
  fee_sub_category_id: z.string().optional().nullable(),
  description: z.string().min(1),
  amount: z.number().min(0.01),
  due_date: z.coerce.date().optional(),
  is_manual_fine: z.boolean().optional(),
});
export type AdHocInvoiceBulkInput = z.infer<typeof adHocInvoiceBulkSchema>;

export const initiatePaymentSchema = z.object({
  invoice_id: z.string().min(1),
  gateway: z.enum(["BKASH", "NAGAD", "ROCKET", "SSLCOMMERZ"]),
});

// Plan Fourteen, Phase N4 -- Fee Collection redesign. Multi-line "Receive
// Fee" submit -- one $transaction, reuses the existing single-invoice
// /collect logic per line (fine resolution via the new engine, existing
// advance-payment/credit-balance handling untouched).
const collectBatchLineSchema = z.object({
  invoice_id: z.string().min(1),
  amount: z.number().min(0.01),
  discount_amount: z.number().min(0).optional(),
  // Per-collection waiver override (Plan Fifteen, Phase E) — "collect the
  // full amount for this one payment, ignoring the standing waiver just
  // this once." Never a permanent revoke: the StudentWaiver assignment and
  // its InvoiceWaiverApplication row(s) stay untouched and fully active for
  // the student's next invoice.
  override_waiver_application_ids: z.array(z.string().min(1)).optional(),
});
export const collectBatchSchema = z.object({
  lines: z.array(collectBatchLineSchema).min(1),
  gateway: z.enum(["CASH", "BANK_TRANSFER", "BKASH", "NAGAD", "ROCKET"]),
  notes: z.string().optional(),
  secondary_receipt_no: z.string().optional(),
  send_sms: z.boolean().optional(),
});
export type CollectBatchInput = z.infer<typeof collectBatchSchema>;

// "Add One-Time Fee" / "Add Fine" ad-hoc invoice -- fee_structure_id stays
// null (already schema-legal today), category/sub-category/amount/
// description are staff-entered directly rather than resolved from a
// FeeStructure row.
export const adHocInvoiceSchema = z.object({
  student_id: z.string().min(1),
  category: feeCategorySchema,
  fee_sub_category_id: z.string().optional().nullable(),
  description: z.string().min(1),
  amount: z.number().min(0.01),
  due_date: z.coerce.date().optional(),
  is_manual_fine: z.boolean().optional(),
});
export type AdHocInvoiceInput = z.infer<typeof adHocInvoiceSchema>;
