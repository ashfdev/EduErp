import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface DailyAttendanceSummary {
  present: number;
  total: number;
  percentage: number;
}

// The blanket/daily-campus counterpart to computeSubjectWiseAttendance() —
// one number per student (no subject dimension exists in AttendanceRecord),
// used only when AttendanceRules.exam_attendance_source is DAILY_CAMPUS.
// Mirrors checkPromotionEligibility()'s existing DAILY_ATTENDANCE_ONLY mode
// exactly (present-vs-total from AttendanceRecord, PRESENT-only numerator,
// LATE counts toward the denominator not the numerator) so "daily
// attendance" means the same thing everywhere it's offered as a choice.
export async function computeDailyAttendancePercentage(
  tx: Tx,
  studentIds: string[],
  dateRange?: { gte?: Date; lte?: Date },
): Promise<Map<string, DailyAttendanceSummary>> {
  const result = new Map<string, DailyAttendanceSummary>();
  for (const id of studentIds) result.set(id, { present: 0, total: 0, percentage: 100 });
  if (!studentIds.length) return result;

  const rows = await tx.attendanceRecord.groupBy({
    by: ["person_id", "status"],
    where: { person_id: { in: studentIds }, person_type: "STUDENT", ...(dateRange ? { date: dateRange } : {}) },
    _count: { _all: true },
  });

  const perStudent = new Map<string, { present: number; total: number }>();
  for (const row of rows) {
    if (!perStudent.has(row.person_id)) perStudent.set(row.person_id, { present: 0, total: 0 });
    const entry = perStudent.get(row.person_id)!;
    entry.total += row._count._all;
    if (row.status === "PRESENT") entry.present += row._count._all;
  }

  for (const [studentId, { present, total }] of perStudent) {
    result.set(studentId, { present, total, percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : 100 });
  }

  return result;
}
