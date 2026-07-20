import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface PromotionEligibility {
  eligible: boolean;
  reason?: string;
}

// Shared by the promotion-roster preview endpoint and both promote paths
// (single-student and bulk) so a student's eligibility can never drift
// between "what the roster showed" and "what actually got enforced" —
// failed-subject and attendance checks live here once, not duplicated.
export async function checkPromotionEligibility(tx: Tx, studentId: string): Promise<PromotionEligibility> {
  // Was previously an unscoped findFirst across the student's entire
  // MarkEntry history — a subject failed years ago (and since passed every
  // subsequent exam) permanently blocked every future promotion, despite
  // this function's own error message already claiming "latest exam" only.
  // Fixed by first resolving the actual most-recent exam this student has
  // any marks for, then checking only that exam's entries.
  const latestExamEntry = await tx.markEntry.findFirst({
    where: { student_id: studentId },
    orderBy: { exam: { end_date: "desc" } },
    select: { exam_id: true },
  });
  if (latestExamEntry) {
    const failedInLatestExam = await tx.markEntry.findFirst({
      where: { student_id: studentId, exam_id: latestExamEntry.exam_id, grade_letter: "F" },
    });
    if (failedInLatestExam) {
      return { eligible: false, reason: "Failed a subject in the latest exam" };
    }
  }

  const attendanceRules = await tx.attendanceRules.findUnique({ where: { id: "singleton" } });
  if (attendanceRules) {
    // Same fix, same reasoning — scope attendance to the current academic
    // year's date range rather than the student's entire attendance history,
    // so a past year's poor attendance doesn't permanently block promotion
    // once the current year's actual attendance is fine.
    const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
    const dateFilter = activeYear ? { date: { gte: activeYear.start_date, lte: activeYear.end_date } } : {};
    const totalAttendance = await tx.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT", ...dateFilter } });
    const presentCount = await tx.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT", status: "PRESENT", ...dateFilter } });
    const percentage = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 100;
    if (percentage < attendanceRules.min_attendance_percentage) {
      return { eligible: false, reason: `Attendance below ${attendanceRules.min_attendance_percentage}%` };
    }
  }

  return { eligible: true };
}
