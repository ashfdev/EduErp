import { z } from "zod";

export const RESOURCE_TYPES = ["LECTURE_SLIDE", "HANDOUT", "ASSIGNMENT", "OTHER"] as const;

export const createTeachingResourceSchema = z.object({
  class_id: z.string().min(1),
  section_id: z.string().optional().nullable(),
  subject_id: z.string().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  resource_type: z.enum(RESOURCE_TYPES).default("OTHER"),
  publish_at: z.coerce.date().optional().nullable(),
  expire_at: z.coerce.date().optional().nullable(),
  due_date: z.coerce.date().optional().nullable(),
});
export type CreateTeachingResourceInput = z.infer<typeof createTeachingResourceSchema>;

export const updateTeachingResourceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  resource_type: z.enum(RESOURCE_TYPES).optional(),
  is_published: z.boolean().optional(),
  publish_at: z.coerce.date().optional().nullable(),
  expire_at: z.coerce.date().optional().nullable(),
  due_date: z.coerce.date().optional().nullable(),
});
export type UpdateTeachingResourceInput = z.infer<typeof updateTeachingResourceSchema>;
