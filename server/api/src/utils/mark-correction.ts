import { prisma } from "../lib/prisma";

// Shared by marks.routes.ts's POST /submit (the SUBJECT_TEACHER/CLASS_TEACHER
// ownership check that already existed there) and mark-correction.routes.ts's
// POST / (Plan Fourteen, Phase M) — one definition so the two checks can
// never drift. Matches every subject in subjectIds against a real
// SubjectTeacherAssignment row for the caller's own Staff record.
export async function isTeacherAssignedToSubjects(userId: string, subjectIds: string[]): Promise<{ assigned: boolean; staffId: string | null }> {
  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  if (!staff) return { assigned: false, staffId: null };
  const assignments = await prisma.subjectTeacherAssignment.findMany({ where: { staff_id: staff.id, subject_id: { in: subjectIds } } });
  const assignedSubjectIds = new Set(assignments.map((a) => a.subject_id));
  return { assigned: subjectIds.every((id) => assignedSubjectIds.has(id)), staffId: staff.id };
}

// Lazily flips a past-expiry APPROVED row to EXPIRED on next read — same
// lazy-sync-on-read convention syncOverdueInvoices() already uses for
// Invoice.status, called at the top of every route that reads correction
// status (the /submit COMPLETED-exam path, GET /mine, GET /pending).
export async function syncExpiredMarkCorrections(): Promise<void> {
  await prisma.markCorrectionRequest.updateMany({
    where: { status: "APPROVED", expires_at: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}
