import type { Prisma, PrismaClient } from "@education-erp/db";
import { computeSubjectWiseAttendance } from "./subject-attendance";

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
  if (!attendanceRules) return { eligible: true };

  // Scope to the current academic year's date range rather than the
  // student's entire attendance history, so a past year's poor attendance
  // doesn't permanently block promotion once the current year is fine.
  const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
  const dateRange = activeYear ? { gte: activeYear.start_date, lte: activeYear.end_date } : undefined;

  if (attendanceRules.promotion_attendance_mode === "DAILY_ATTENDANCE_ONLY") {
    // Mode C — the owner's own framing: "once the homeroom teacher takes
    // attendance, that's it." Literally the original, unchanged blanket
    // AttendanceRecord calculation this function always did — kept as its
    // own explicit branch (not folded into the subject-wise util) so this
    // mode's behavior can never silently drift from what it always was.
    // This is also the default mode, so a fresh deploy of this migration
    // doesn't change any school's live promotion outcomes.
    const dateWhere = dateRange ? { date: dateRange } : {};
    const totalAttendance = await tx.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT", ...dateWhere } });
    const presentCount = await tx.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT", status: "PRESENT", ...dateWhere } });
    const percentage = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 100;
    if (percentage < attendanceRules.min_attendance_percentage) {
      return { eligible: false, reason: `Attendance below ${attendanceRules.min_attendance_percentage}%` };
    }
    return { eligible: true };
  }

  const summary = (await computeSubjectWiseAttendance(tx, [studentId], dateRange)).get(studentId)!;

  if (attendanceRules.promotion_attendance_mode === "AVERAGE_ALL_SUBJECTS") {
    // Mode A — pooled Σpresent/Σtotal across every subject, not a mean of
    // per-subject percentages: pooling is what keeps a brand-new elective
    // with 2 sessions from swinging the result as much as a core subject
    // with 60.
    if (summary.overall.percentage < attendanceRules.min_attendance_percentage) {
      return { eligible: false, reason: `Attendance below ${attendanceRules.min_attendance_percentage}%` };
    }
    return { eligible: true };
  }

  // Mode B — EVERY_SUBJECT_MINIMUM. Only subjects with enough recorded
  // sessions count, so a brand-new elective with 1-2 sessions can't
  // single-handedly block a promotion; zero qualifying subjects means
  // "insufficient data yet," not a block.
  const failing = summary.subjects.filter(
    (s) => s.total >= attendanceRules.promotion_min_sessions_per_subject && s.percentage < attendanceRules.min_attendance_percentage,
  );
  if (failing.length > 0) {
    const subjectNames = await tx.subject.findMany({ where: { id: { in: failing.map((s) => s.subject_id) } }, select: { id: true, name_en: true } });
    const nameById = new Map(subjectNames.map((s) => [s.id, s.name_en]));
    const list = failing.map((s) => `${nameById.get(s.subject_id) ?? s.subject_id} (${s.percentage}%)`).join(", ");
    return { eligible: false, reason: `Below ${attendanceRules.min_attendance_percentage}% in ${failing.length} subject(s): ${list}` };
  }
  return { eligible: true };
}
