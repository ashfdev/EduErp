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
