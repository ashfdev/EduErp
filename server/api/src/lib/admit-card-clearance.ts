import { prisma } from "./prisma";
import { computeStudentLibraryFines } from "../modules/library/library-fine.helper";

// Clearance gate: accounts due -> library fine -> exam office approval.
// Accounts is only enforced if FeeRules.block_admit_on_due is set (an
// existing, previously-dead Settings flag) — library and exam-office are
// always checked, matching the fixed 3-stage pipeline this was asked for.
//
// Extracted from portal.routes.ts (pure move, zero logic change) so the
// staff-facing batch admit-card route (documents.routes.ts) can enforce the
// exact same gate the portal's own self-service download already does,
// instead of the batch route silently skipping all three checks.
export async function checkAdmitCardClearance(studentId: string, examId: string) {
  const rules = await prisma.feeRules.findUnique({ where: { id: "singleton" } });
  const invoices = await prisma.invoice.findMany({ where: { student_id: studentId, status: { notIn: ["PAID", "WAIVED"] } } });
  const dueAmount = invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
  const accountsRequired = rules?.block_admit_on_due ?? false;
  const accountsClear = !accountsRequired || dueAmount <= 0;

  const { total_fines } = await computeStudentLibraryFines(studentId);
  const libraryClear = total_fines <= 0;

  const seatPlan = await prisma.examSeatPlan.findUnique({ where: { exam_id_student_id: { exam_id: examId, student_id: studentId } } });
  const examOfficeClear = seatPlan?.exam_office_cleared ?? false;

  return {
    accounts: { required: accountsRequired, clear: accountsClear, due_amount: dueAmount },
    library: { clear: libraryClear, fine_amount: total_fines },
    exam_office: { clear: examOfficeClear },
    all_clear: accountsClear && libraryClear && examOfficeClear,
  };
}
