import { z } from "zod";

export const applyStudentLeaveSchema = z.object({
  from_date: z.coerce.date(),
  to_date: z.coerce.date(),
  reason: z.string().min(1),
});
export type ApplyStudentLeaveInput = z.infer<typeof applyStudentLeaveSchema>;

export const rejectStudentLeaveSchema = z.object({
  reason: z.string().min(1),
});
