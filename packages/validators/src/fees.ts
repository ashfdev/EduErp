import { z } from "zod";

export const feeCategorySchema = z.enum([
  "ADMISSION", "READMISSION", "TUITION", "EXAM", "TRANSPORT", "HOSTEL", "LAB", "LIBRARY", "SPORTS", "DEVELOPMENT", "OTHER",
]);

export const feeStructureSchema = z.object({
  academic_year_id: z.string().min(1),
  class_id: z.string().optional().nullable(),
  section_id: z.string().optional().nullable(),
  category: feeCategorySchema,
  name: z.string().min(1),
  amount: z.number().min(0),
  frequency: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
  due_day: z.number().int().min(1).max(28).optional().nullable(),
});
export type FeeStructureInput = z.infer<typeof feeStructureSchema>;

export const generateInvoiceSchema = z.object({
  fee_structure_id: z.string().min(1),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().optional(),
  student_ids: z.array(z.string()).optional(),
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

export const initiatePaymentSchema = z.object({
  invoice_id: z.string().min(1),
  gateway: z.enum(["BKASH", "NAGAD", "ROCKET", "SSLCOMMERZ"]),
});
