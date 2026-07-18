import { z } from "zod";

export const createDocumentRequestSchema = z.object({
  student_id: z.string().min(1),
  doc_type: z.enum(["TRANSFER_CERTIFICATE", "TESTIMONIAL"]),
  reason: z.string().optional(),
});
export type CreateDocumentRequestInput = z.infer<typeof createDocumentRequestSchema>;

export const rejectDocumentRequestSchema = z.object({
  rejection_reason: z.string().min(1),
});
