import type { Prisma, PrismaClient } from "@education-erp/db";
import { badRequest } from "../lib/errors";

type Tx = Prisma.TransactionClient | PrismaClient;

// The real, actively-designed-around consequence of per-class-scoped
// Groups: a student's group_id is only meaningful within the class it was
// assigned in (a "Science" row in Class 9 is a different database row than
// "Science" in Class 10). Call this before every class-change path so a
// destination class that defines groups always requires an explicit
// (re-)selection — never silently carries the old class's group_id forward
// into a class where that id means nothing.
export async function assertGroupSelectedIfRequired(tx: Tx, classId: string, groupId?: string | null) {
  if (groupId) {
    // Provided — must actually belong to this class (a Class 10 group id
    // assigned to a Class 9 student would otherwise silently persist as a
    // meaningless foreign reference).
    const group = await tx.group.findFirst({ where: { id: groupId, class_id: classId, is_active: true } });
    if (!group) throw badRequest("The selected group does not belong to this class");
    return;
  }
  const hasGroups = await tx.group.findFirst({ where: { class_id: classId, is_active: true } });
  if (hasGroups) {
    throw badRequest("This class has Groups/Streams defined — a group must be selected before assigning a student to it");
  }
}

export async function inheritSubjectsForClass(
  tx: Tx,
  studentId: string,
  classId: string,
  academicYearId: string,
  selectedOptionalSubjectIds: string[] = [],
  studentGroupId?: string | null,
) {
  const allSubjects = await tx.subject.findMany({ where: { class_id: classId, is_active: true } });
  // group_id === null means "applies to every group in this class" — the
  // unchanged existing behavior for every call site that doesn't pass a
  // group. A subject scoped to a specific group is only inherited by a
  // student in that same group.
  const subjects = allSubjects.filter((s) => s.group_id === null || s.group_id === studentGroupId);
  const compulsory = subjects.filter((s) => s.is_compulsory);
  const optional = subjects.filter((s) => s.is_optional);

  const toAssign = [
    ...compulsory.map((s) => ({ subject_id: s.id, is_inherited: true })),
    ...optional
      .filter((s) => selectedOptionalSubjectIds.includes(s.id))
      .map((s) => ({ subject_id: s.id, is_inherited: false })),
  ];

  if (toAssign.length > 0) {
    await tx.studentSubject.createMany({
      data: toAssign.map((a) => ({
        student_id: studentId,
        subject_id: a.subject_id,
        is_inherited: a.is_inherited,
        academic_year_id: academicYearId,
      })),
      skipDuplicates: true,
    });
  }

  return { compulsory, optional };
}
