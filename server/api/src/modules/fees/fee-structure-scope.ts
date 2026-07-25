import type { Prisma, PrismaClient, FeeStructure } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// The single shared resolver every read site that used to check
// structure.class_id directly must now use identically (Plan Fourteen,
// Phase N3 -- the single biggest correctness risk in that phase). When
// FeeStructureClass rows exist for a structure, they win (the legacy
// class_id scalar is enforced null at write time in that case); otherwise
// falls back to the legacy scalar exactly as before multi-class existed.
// Returns null when the structure has no class scoping at all (applies
// institution-wide), matching every existing class_id === null behavior.
export async function resolveFeeStructureClassIds(tx: Tx, structure: Pick<FeeStructure, "id" | "class_id">): Promise<string[] | null> {
  const rows = await tx.feeStructureClass.findMany({ where: { fee_structure_id: structure.id }, select: { class_id: true } });
  if (rows.length > 0) return rows.map((r) => r.class_id);
  return structure.class_id ? [structure.class_id] : null;
}

// Does this FeeStructure apply to a student in the given class/section?
// Section-level narrowing is only meaningful for the legacy single-class
// form (structure.section_id is enforced null at write time whenever
// FeeStructureClass rows exist, so it's naturally a no-op for real
// multi-class structures).
export async function feeStructureAppliesToStudent(
  tx: Tx,
  structure: Pick<FeeStructure, "id" | "class_id" | "section_id">,
  studentClassId: string | null,
  studentSectionId: string | null,
): Promise<boolean> {
  const classIds = await resolveFeeStructureClassIds(tx, structure);
  if (classIds !== null && (!studentClassId || !classIds.includes(studentClassId))) return false;
  if (structure.section_id && structure.section_id !== studentSectionId) return false;
  return true;
}
