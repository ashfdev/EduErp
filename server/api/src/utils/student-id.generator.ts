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

  if (config.sequence_scope === "YEARLY") {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);
    const count = await prisma.student.count({ where: { created_at: { gte: yearStart, lt: yearEnd } } });
    sequence = count + 1;
  } else if (config.sequence_scope === "CLASS") {
    if (!currentClassId) throw new Error("class_id is required for CLASS-scoped student ID generation");
    const count = await prisma.student.count({ where: { current_class_id: currentClassId } });
    sequence = count + 1;
  } else {
    const updated = await prisma.studentIdConfig.update({
      where: { id: CONFIG_ID },
      data: { current_sequence: { increment: 1 } },
    });
    sequence = updated.current_sequence;
  }

  const uid = formatStudentId({ ...config, year_format: config.year_format === "4" ? "4" : "2" }, sequence);
  await prisma.studentIdConfig.update({ where: { id: CONFIG_ID }, data: { preview_example: uid } });
  return uid;
}
