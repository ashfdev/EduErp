import { prisma } from "../lib/prisma";
import { formatStudentId } from "../lib/student-id-format";

const CONFIG_ID = "singleton";

/**
 * GLOBAL scope atomically increments the shared sequence counter.
 * YEARLY/CLASS scopes don't have dedicated counter columns in
 * StudentIdConfig, so they're derived by counting existing students in
 * that scope instead — self-resetting with no extra state to maintain.
 */
export async function generateStudentUID(currentClassId?: string): Promise<string> {
  const config = await prisma.studentIdConfig.findUniqueOrThrow({ where: { id: CONFIG_ID } });

  let sequence: number;
  // Only ever set for CLASS scope (see below) — every other scope's output
  // stays byte-for-byte unchanged.
  let classSegment: string | undefined;

  if (config.sequence_scope === "YEARLY") {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);
    const count = await prisma.student.count({ where: { created_at: { gte: yearStart, lt: yearEnd } } });
    sequence = count + 1;
  } else if (config.sequence_scope === "CLASS") {
    if (!currentClassId) throw new Error("class_id is required for CLASS-scoped student ID generation");
    const count = await prisma.student.count({ where: { current_class_id: currentClassId } });
    sequence = count + 1;
    // CRITICAL FIX: the formatted ID previously had no class-identifying
    // component at all — just PREFIX-YEAR-SEQUENCE — so two different
    // classes each restarting their own count at 1 produced the identical
    // ID string, colliding against student_uid's global uniqueness
    // constraint (confirmed live: class 7's 2nd student collided with
    // class 6's already-existing ID). Encoding the class's numeric_level
    // into the ID itself makes CLASS-scoped numbering safe: the visible
    // "restarts per class" behavior an admin picking this scope actually
    // wants is preserved, but two classes can now never collide.
    const klass = await prisma.class.findUnique({ where: { id: currentClassId }, select: { numeric_level: true } });
    classSegment = String(klass?.numeric_level ?? 0).padStart(2, "0");
  } else {
    const updated = await prisma.studentIdConfig.update({
      where: { id: CONFIG_ID },
      data: { current_sequence: { increment: 1 } },
    });
    sequence = updated.current_sequence;
  }

  const uid = formatStudentId({ ...config, year_format: config.year_format === "4" ? "4" : "2" }, sequence, new Date(), classSegment);
  await prisma.studentIdConfig.update({ where: { id: CONFIG_ID }, data: { preview_example: uid } });
  return uid;
}
