import { z } from "zod";

export const healthProfileSchema = z.object({
  allergies: z.string().optional().nullable(),
  chronic_conditions: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type HealthProfileInput = z.infer<typeof healthProfileSchema>;

export const healthIncidentSchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1),
  action_taken: z.string().optional().nullable(),
});
export type HealthIncidentInput = z.infer<typeof healthIncidentSchema>;
