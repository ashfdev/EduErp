import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface SubjectPercentage {
  subject_id: string;
  present: number;
  total: number;
  percentage: number;
}

export interface SubjectWiseSummary {
  subjects: SubjectPercentage[];
  overall: { present: number; total: number; percentage: number };
}

// Single shared implementation of "present vs total from SubjectAttendance,
// per subject and pooled overall" — used by checkPromotionEligibility,
// computeStudentRisk, GET /defaulters, the report-card attendance block,
// and the portal/admin per-subject views. One groupBy for the whole batch
// of students, not a per-student/per-subject query loop — subject-wise
// data is ~7x the row volume of the old blanket AttendanceRecord, so an
// unbatched loop here would multiply that further (this codebase already
// had two independent, textually-different blanket versions of this exact
// calculation before this util existed; this is the one place it happens
// now).
export async function computeSubjectWiseAttendance(
  tx: Tx,
  studentIds: string[],
  dateRange?: { gte?: Date; lte?: Date },
): Promise<Map<string, SubjectWiseSummary>> {
  const result = new Map<string, SubjectWiseSummary>();
  for (const id of studentIds) result.set(id, { subjects: [], overall: { present: 0, total: 0, percentage: 100 } });
  if (!studentIds.length) return result;

  const rows = await tx.subjectAttendance.groupBy({
    by: ["student_id", "subject_id", "status"],
    where: { student_id: { in: studentIds }, ...(dateRange ? { date: dateRange } : {}) },
    _count: { _all: true },
  });

  // student_id -> subject_id -> { present, total }
  const perStudent = new Map<string, Map<string, { present: number; total: number }>>();
  for (const row of rows) {
    if (!perStudent.has(row.student_id)) perStudent.set(row.student_id, new Map());
    const bySubject = perStudent.get(row.student_id)!;
    if (!bySubject.has(row.subject_id)) bySubject.set(row.subject_id, { present: 0, total: 0 });
    const entry = bySubject.get(row.subject_id)!;
    entry.total += row._count._all;
    // Numerator is PRESENT-only — LATE counts toward the denominator but
    // not the numerator, mirroring checkPromotionEligibility's existing
    // (pre-subject-wise) definition of "attendance" exactly.
    if (row.status === "PRESENT") entry.present += row._count._all;
  }

  for (const [studentId, bySubject] of perStudent) {
    const subjects: SubjectPercentage[] = [];
    let overallPresent = 0;
    let overallTotal = 0;
    for (const [subjectId, { present, total }] of bySubject) {
      subjects.push({ subject_id: subjectId, present, total, percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : 100 });
      overallPresent += present;
      overallTotal += total;
    }
    result.set(studentId, {
      subjects,
      overall: { present: overallPresent, total: overallTotal, percentage: overallTotal > 0 ? Math.round((overallPresent / overallTotal) * 1000) / 10 : 100 },
    });
  }

  return result;
}
