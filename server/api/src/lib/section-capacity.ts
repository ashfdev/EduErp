import { prisma } from "./prisma";
import { ApiError } from "./errors";

// Soft warning with an explicit override, not a hard block — a classroom
// capacity is an administrative target BD schools do sometimes need to
// exceed (siblings, late admissions, a strong student transferring in),
// unlike a hostel bed which is a real physical limit (see hostel.routes.ts's
// hard-block for that different case). Every call site must let the caller
// resubmit with override:true after showing the count to a human, rather
// than silently allowing or permanently blocking.
export async function assertSectionCapacity(sectionId: string | null | undefined, override?: boolean): Promise<void> {
  if (!sectionId || override) return;

  const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { capacity: true } });
  if (!section) return;

  const count = await prisma.student.count({ where: { current_section_id: sectionId, deleted_at: null, status: "ACTIVE" } });
  if (count >= section.capacity) {
    throw new ApiError(
      400,
      "SECTION_AT_CAPACITY",
      `This section is at or over its configured capacity (${count}/${section.capacity}). Continue anyway?`,
    );
  }
}
