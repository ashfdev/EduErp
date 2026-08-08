import { prisma } from "../lib/prisma";

// Shared by marks.routes.ts's POST /submit (the SUBJECT_TEACHER/CLASS_TEACHER
// ownership check that already existed there) and mark-correction.routes.ts's
// POST / (Plan Fourteen, Phase M) — one definition so the two checks can
// never drift.
//
// Real bug found and fixed (post-audit, 2026-08-08): the original version of
// this check only matched subject_id, never section_id — a teacher with a
// SubjectTeacherAssignment for a subject in ONE section (e.g. Math in
// Section A only) was treated as "assigned" for that subject everywhere,
// letting them submit/overwrite marks for a DIFFERENT section's students in
// the same subject via a direct API call. The grid's own GET route
// (marks.routes.ts, the `assignedSubjectIds` query) already correctly scopes
// by section (`OR: [{section_id}, {section_id: null}]`, matching this
// codebase's "null section_id = whole-class assignment" convention) — this
// fix brings the write-path check in line with it.
//
// `pairs[].section_id: null` means "checking whether the teacher is assigned
// to this subject for the WHOLE class" (e.g. a correction request scoped to
// an entire class, not one section) — satisfied only by a real whole-class
// (section_id: null) assignment, never by a single per-section one, so a
// teacher can't parlay a one-section assignment into whole-class correction
// rights. A pair with a real section_id is satisfied by either a matching
// per-section assignment OR a whole-class one (the whole-class row covers
// every section, same as the GET route's own OR logic).
export async function isTeacherAssignedToSubjectSections(
  userId: string,
  pairs: { subject_id: string; section_id: string | null }[],
): Promise<{ assigned: boolean; staffId: string | null }> {
  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  if (!staff) return { assigned: false, staffId: null };
  const subjectIds = [...new Set(pairs.map((p) => p.subject_id))];
  const assignments = await prisma.subjectTeacherAssignment.findMany({ where: { staff_id: staff.id, subject_id: { in: subjectIds } } });
  const wholeClassSubjects = new Set(assignments.filter((a) => a.section_id === null).map((a) => a.subject_id));
  const sectionAssignments = new Set(assignments.filter((a) => a.section_id !== null).map((a) => `${a.subject_id}::${a.section_id}`));
  const assigned = pairs.every(
    (p) => wholeClassSubjects.has(p.subject_id) || (p.section_id !== null && sectionAssignments.has(`${p.subject_id}::${p.section_id}`)),
  );
  return { assigned, staffId: staff.id };
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
