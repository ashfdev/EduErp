import { prisma } from "./prisma";

// Resolves whether a user (by their own login id) has a real
// SubjectTeacherAssignment for one specific subject in one specific
// section — the ownership boundary subject-wise attendance marking needs.
// Deliberately not retrofitted onto the two similar-but-not-identical
// existing lookups (attendance.routes.ts's assertSectionOwnership, which is
// section-broad with no subject filter; marks.routes.ts's grid-view check,
// which fetches every assignment in the section and filters client-side) —
// refactoring two already-correct, live call sites for DRY-purity alone
// isn't worth the regression risk. This exists so a third independent
// hand-written copy of this exact shape never happens again.
export async function hasSubjectTeacherAssignment(userId: string, subjectId: string, sectionId: string): Promise<boolean> {
  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  if (!staff) return false;

  const assignment = await prisma.subjectTeacherAssignment.findFirst({
    where: { staff_id: staff.id, subject_id: subjectId, OR: [{ section_id: sectionId }, { section_id: null }] },
  });
  return !!assignment;
}

// Every subject id a user (by their own login id) has ANY SubjectTeacherAssignment
// for, across every class/section/year. Used to filter subject pickers down to
// what a teacher is actually assigned to teach, rather than every subject in a
// class -- previously duplicated inline as quizzes.routes.ts's own
// getVisibleSubjectIds(); centralized here so a picker and an ownership check
// can never quietly drift apart. Returns [] (not a thrown error) when the caller
// has no linked Staff row, since an empty "nothing assigned" result is the
// correct answer for a subject-picker filter, not a hard failure.
export async function resolveAssignedSubjectIds(userId: string): Promise<string[]> {
  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  if (!staff) return [];
  const assignments = await prisma.subjectTeacherAssignment.findMany({ where: { staff_id: staff.id } });
  return [...new Set(assignments.map((a) => a.subject_id))];
}
