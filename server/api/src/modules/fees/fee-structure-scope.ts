import type { Prisma, PrismaClient, FeeStructure } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// Does this FeeStructure apply to a given student?
//
// Checked in this order:
//  1. Individually assigned (FeeStructureStudent) -- always applies,
//     regardless of the student's class/section/group. This is how one
//     specific student can be attached to a fee that has nothing to do
//     with their class (an extra elective, a one-off re-sit fee), and it
//     always wins over class/group scoping below. Skipped when studentId
//     is null (enroll-time preview screens call this before the student
//     row exists yet, so there is nothing to individually match against).
//  2. FeeStructureClass rows, when any exist for this structure -- these
//     win over the legacy class_id/section_id scalars (enforced null at
//     write time whenever real rows exist). Each row is either a whole-
//     class row (group_id: null, unchanged meaning from before Groups
//     could be scoped at all) or a class+group row (group_id set --
//     applies only to that one Group within the class, e.g. a
//     Science-only Lab Fee).
//  3. The legacy class_id/section_id scalar, exactly as before any of this
//     existed -- a structure that's never been touched by "Assign to
//     Classes/Groups" behaves byte-for-byte as it always has.
export async function feeStructureAppliesToStudent(
  tx: Tx,
  structure: Pick<FeeStructure, "id" | "class_id" | "section_id">,
  studentClassId: string | null,
  studentSectionId: string | null,
  studentId?: string | null,
  studentGroupId?: string | null,
): Promise<boolean> {
  if (studentId) {
    const individual = await tx.feeStructureStudent.findUnique({
      where: { fee_structure_id_student_id: { fee_structure_id: structure.id, student_id: studentId } },
    });
    if (individual) return true;
  }

  const classRows = await tx.feeStructureClass.findMany({ where: { fee_structure_id: structure.id }, select: { class_id: true, group_id: true } });
  if (classRows.length > 0) {
    if (!studentClassId) return false;
    return classRows.some((r) => r.class_id === studentClassId && (r.group_id === null || r.group_id === studentGroupId));
  }

  if (structure.class_id && (!studentClassId || structure.class_id !== studentClassId)) return false;
  if (structure.section_id && structure.section_id !== studentSectionId) return false;
  return true;
}

// Builds a Prisma StudentWhereInput capturing every student a FeeStructure
// applies to -- for the bulk "generate an invoice for everyone this
// structure covers" call sites (bulk-monthly generation, "Generate
// Invoices Now"), which need to find the matching students directly
// rather than check one student at a time. Mirrors
// feeStructureAppliesToStudent's own three-tier resolution (individual
// assignment, then class/group rows, then the legacy scalar fallback),
// OR'd together since any one of the three is sufficient.
export async function buildFeeStructureStudentWhere(
  tx: Tx,
  structure: Pick<FeeStructure, "id" | "class_id" | "section_id">,
): Promise<Prisma.StudentWhereInput> {
  const individualIds = (await tx.feeStructureStudent.findMany({ where: { fee_structure_id: structure.id }, select: { student_id: true } })).map((r) => r.student_id);
  const classRows = await tx.feeStructureClass.findMany({ where: { fee_structure_id: structure.id }, select: { class_id: true, group_id: true } });

  if (classRows.length > 0) {
    return {
      OR: [
        ...(individualIds.length ? [{ id: { in: individualIds } }] : []),
        ...classRows.map((r) => (r.group_id ? { current_class_id: r.class_id, group_id: r.group_id } : { current_class_id: r.class_id })),
      ],
    };
  }

  const legacyWhere: Prisma.StudentWhereInput = {
    ...(structure.class_id ? { current_class_id: structure.class_id } : {}),
    ...(structure.section_id ? { current_section_id: structure.section_id } : {}),
  };
  if (!individualIds.length) return legacyWhere;
  // Legacy scalar unset (applies institution-wide) -- individually assigned
  // students are already covered by the empty legacyWhere matching everyone,
  // so no OR is needed in that specific case.
  if (!structure.class_id && !structure.section_id) return legacyWhere;
  return { OR: [{ id: { in: individualIds } }, legacyWhere] };
}
