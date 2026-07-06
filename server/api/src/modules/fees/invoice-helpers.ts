import type { Prisma, PrismaClient, FeeStructure } from "@education-erp/db";
import { generateInvoiceNo } from "./fee-number.generator";

type Tx = Prisma.TransactionClient | PrismaClient;

// Shared by /invoices/generate-bulk-monthly and the admission enroll handler
// (which invoices a new student's first month immediately) — one place for
// the idempotency check so neither call site can drift from it and risk a
// duplicate invoice for the same student+structure+month+year.
export async function createMonthlyInvoiceIfMissing(
  tx: Tx,
  studentId: string,
  structure: FeeStructure,
  month: number,
  year: number,
): Promise<{ created: boolean }> {
  const existing = await tx.invoice.findFirst({ where: { student_id: studentId, fee_structure_id: structure.id, month, year } });
  if (existing) return { created: false };

  const dueDate = new Date(year, month - 1, structure.due_day ?? 10);
  await tx.invoice.create({
    data: {
      invoice_no: await generateInvoiceNo(tx, year),
      student_id: studentId,
      fee_structure_id: structure.id,
      academic_year_id: structure.academic_year_id,
      category: structure.category,
      description: structure.name,
      amount_due: structure.amount,
      due_date: dueDate,
      month,
      year,
    },
  });
  return { created: true };
}
