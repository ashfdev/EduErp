import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"]);

export const markAttendanceSchema = z.object({
  class_id: z.string().min(1),
  section_id: z.string().min(1),
  shift_id: z.string().optional().nullable(),
  date: z.coerce.date(),
  period_no: z.number().int().optional().nullable(),
  records: z.array(
    z.object({
      student_id: z.string().min(1),
      status: attendanceStatusSchema,
      override_reason: z.string().optional(),
    }),
  ),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const markStaffAttendanceSchema = z.object({
  date: z.coerce.date(),
  records: z.array(
    z.object({
      staff_id: z.string().min(1),
      status: attendanceStatusSchema,
      override_reason: z.string().optional(),
    }),
  ),
});
export type MarkStaffAttendanceInput = z.infer<typeof markStaffAttendanceSchema>;

// Subject-wise (per-period) attendance — deliberately no shift_id/
// override_reason/class_id: subject/section/period are all resolved
// server-side from routine_slot_id, never trusted from the client.
export const markSubjectAttendanceSchema = z.object({
  routine_slot_id: z.string().min(1),
  date: z.coerce.date(),
  records: z
    .array(
      z.object({
        student_id: z.string().min(1),
        status: attendanceStatusSchema,
      }),
    )
    .min(1),
});
export type MarkSubjectAttendanceInput = z.infer<typeof markSubjectAttendanceSchema>;
