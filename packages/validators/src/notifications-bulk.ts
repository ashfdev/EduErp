import { z } from "zod";

export const bulkSmsAudienceSchema = z.enum(["STUDENTS", "GUARDIANS", "STAFF", "ALL"]);

export const bulkSmsSchema = z.object({
  audience: bulkSmsAudienceSchema,
  class_id: z.string().optional(),
  section_id: z.string().optional(),
  staff_role: z.string().optional(),
  // Explicit override — when provided, sends only to these Guardian/Staff
  // ids (resolved to their phone) instead of the audience filter above.
  recipient_ids: z.array(z.string()).optional(),
  message: z.string().min(1).max(640),
});
