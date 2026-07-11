import { z } from "zod";

export const disciplineRecordSchema = z.object({
  category: z.enum(["INCIDENT", "COUNSELING", "COMMENDATION"]),
  description: z.string().min(1),
  action_taken: z.string().optional().nullable(),
  occurred_at: z.coerce.date().optional(),
});
export type DisciplineRecordInput = z.infer<typeof disciplineRecordSchema>;
