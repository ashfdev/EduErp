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
  const failedExam = await tx.markEntry.findFirst({ where: { student_id: studentId, grade_letter: "F" } });
  if (failedExam) {
    return { eligible: false, reason: "Failed a subject in the latest exam" };
  }

  const attendanceRules = await tx.attendanceRules.findUnique({ where: { id: "singleton" } });
  if (attendanceRules) {
    const totalAttendance = await tx.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT" } });
    const presentCount = await tx.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT", status: "PRESENT" } });
    const percentage = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 100;
    if (percentage < attendanceRules.min_attendance_percentage) {
      return { eligible: false, reason: `Attendance below ${attendanceRules.min_attendance_percentage}%` };
    }
  }

  return { eligible: true };
}
