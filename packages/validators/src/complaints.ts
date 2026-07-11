import { z } from "zod";

export const createComplaintSchema = z.object({
  category: z.enum(["ACADEMIC", "FACILITY", "STAFF_CONDUCT", "BULLYING", "OTHER"]),
  description: z.string().min(1),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const updateComplaintSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  assigned_to_id: z.string().optional().nullable(),
  resolution_notes: z.string().optional().nullable(),
});
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;
