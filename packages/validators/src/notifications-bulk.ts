import { z } from "zod";

export const bulkSmsAudienceSchema = z.enum(["STUDENTS", "GUARDIANS", "STAFF", "ALL"]);

// Mirrors the Prisma UserRole enum (packages/db/prisma/schema.prisma) —
// validators intentionally don't import the generated Prisma client, so
// this is kept in sync by hand, same convention as gender/employment_type
// elsewhere in this package.
export const staffRoleSchema = z.enum([
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
]);

export const bulkSmsSchema = z.object({
  audience: bulkSmsAudienceSchema,
  class_id: z.string().optional(),
  section_id: z.string().optional(),
  staff_role: staffRoleSchema.optional(),
  // Explicit override — when provided, sends only to these Guardian/Staff
  // ids (resolved to their phone) instead of the audience filter above.
  recipient_ids: z.array(z.string()).optional(),
  message: z.string().min(1).max(640),
});
