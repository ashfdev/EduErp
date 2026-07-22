import { z } from "zod";

export const visitorSchema = z.object({
  visitor_name: z.string().min(1),
  phone: z.string().min(1),
  visitor_type: z.enum(["GUARDIAN", "VENDOR", "OFFICIAL", "OTHER"]),
  relation_type: z.string().optional(),
  relation: z.string().optional(),
  student_id: z.string().optional(),
  class_id: z.string().optional(),
  section_id: z.string().optional(),
  reason: z.string().min(1),
});
