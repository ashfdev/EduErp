import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function inheritSubjectsForClass(
  tx: Tx,
  studentId: string,
  classId: string,
  academicYearId: string,
  selectedOptionalSubjectIds: string[] = [],
) {
  const subjects = await tx.subject.findMany({ where: { class_id: classId, is_active: true } });
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
