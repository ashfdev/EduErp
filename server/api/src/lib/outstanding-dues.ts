import { prisma } from "./prisma";
import { ApiError } from "./errors";
import { computeStudentLibraryFines } from "../modules/library/library-fine.helper";

// Soft warning with an explicit override, matching this codebase's own
// established convention (see section-capacity.ts) — a student leaving
// (graduate/transfer/expel) with real money still owed is worth flagging to
// the admin performing the transition, but not an unconditional hard block:
// a genuine write-off, a scholarship case, or an institution's own judgment
// call can all be legitimate reasons to proceed anyway. Every call site must
// let the caller resubmit with override:true after seeing the amount, never
// silently allow or permanently block.
export async function assertNoOutstandingDues(studentId: string, override?: boolean): Promise<void> {
  if (override) return;

  const invoices = await prisma.invoice.findMany({
    where: { student_id: studentId, status: { not: "PAID" } },
    select: { amount_due: true, amount_paid: true, fine_amount: true },
  });
  const feeDue = invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
  const { total_fines: libraryFines } = await computeStudentLibraryFines(studentId);

  const total = Math.round((feeDue + libraryFines) * 100) / 100;
  if (total > 0) {
    const parts: string[] = [];
    if (feeDue > 0) parts.push(`৳${feeDue} in fee dues`);
    if (libraryFines > 0) parts.push(`৳${libraryFines} in library fines`);
    throw new ApiError(
      400,
      "OUTSTANDING_DUES",
      `This student still owes ${parts.join(" and ")}. Continue anyway?`,
    );
  }
}
