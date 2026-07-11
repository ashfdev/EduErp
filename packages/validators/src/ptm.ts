import { z } from "zod";

export const ptmSlotSchema = z.object({
  date: z.coerce.date(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  class_id: z.string().optional().nullable(),
});
export type PtmSlotInput = z.infer<typeof ptmSlotSchema>;

export const ptmBookSchema = z.object({
  student_id: z.string().min(1),
  notes: z.string().optional().nullable(),
});
export type PtmBookInput = z.infer<typeof ptmBookSchema>;
