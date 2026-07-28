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
  // The single optional subject (if any) the student explicitly designated
  // as their BD "4th subject" for the GPA bonus rule — must be one of
  // selectedOptionalSubjectIds; never auto-inferred from scores, since the
  // real-world choice happens at enrollment time. Any OTHER optional
  // subject the student takes is still enrolled normally, just without
  // this flag — it counts as a plain subject in the average, exactly like
  // a compulsory one.
  fourthSubjectId?: string | null,
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
    ...compulsory.map((s) => ({ subject_id: s.id, is_inherited: true, is_fourth_subject: false })),
    ...optional
      .filter((s) => selectedOptionalSubjectIds.includes(s.id))
      .map((s) => ({ subject_id: s.id, is_inherited: false, is_fourth_subject: s.id === fourthSubjectId })),
  ];

  if (toAssign.length > 0) {
    await tx.studentSubject.createMany({
      data: toAssign.map((a) => ({
        student_id: studentId,
        subject_id: a.subject_id,
        is_inherited: a.is_inherited,
        is_fourth_subject: a.is_fourth_subject,
        academic_year_id: academicYearId,
      })),
      skipDuplicates: true,
    });
  }

  return { compulsory, optional };
}

// Changing which optional subject is a student's designated 4th subject
// doesn't require a class change or re-inheritance — this handles that
// narrower update on its own, called whenever fourth_subject_id is present
// in a student edit regardless of whether the class changed this time.
// undefined means "not provided, leave untouched"; null means "explicitly
// clear it" (the student no longer has a designated 4th subject).
export async function setFourthSubject(tx: Tx, studentId: string, academicYearId: string, fourthSubjectId: string | null | undefined) {
  if (fourthSubjectId === undefined) return;
  await tx.studentSubject.updateMany({
    where: { student_id: studentId, academic_year_id: academicYearId, is_fourth_subject: true },
    data: { is_fourth_subject: false },
  });
  if (fourthSubjectId) {
    // Must already be a real, optional enrollment for this student/year —
    // never silently create one, and never flag a compulsory subject as
    // the 4th subject (is_inherited: false is exactly how
    // inheritSubjectsForClass marks a student-selected optional row).
    const target = await tx.studentSubject.findFirst({
      where: { student_id: studentId, subject_id: fourthSubjectId, academic_year_id: academicYearId, is_inherited: false },
    });
    if (!target) throw badRequest("The 4th subject must be one of this student's already-selected optional subjects");
    await tx.studentSubject.update({ where: { id: target.id }, data: { is_fourth_subject: true } });
  }
}
