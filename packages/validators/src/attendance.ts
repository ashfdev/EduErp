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
