import type { Prisma, PrismaClient, FeeStructure } from "@education-erp/db";
import { generateInvoiceNo, generateReceiptNo } from "./fee-number.generator";
import { createAdvanceCreditConsumptionJournal } from "../accounts/auto-journal.service";

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
  const invoice = await tx.invoice.create({
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

  // Auto-absorb any available advance credit against this brand-new
  // invoice — a family that pre-paid ahead of time (Phase 81's /collect
  // overpayment path) shouldn't see it sit inertly while a fresh invoice
  // shows the full amount as newly due.
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { credit_balance: true } });
  const applied = student ? Math.min(student.credit_balance, invoice.amount_due) : 0;
  if (applied > 0) {
    await tx.student.update({ where: { id: studentId }, data: { credit_balance: { decrement: applied } } });
    const payment = await tx.payment.create({
      data: {
        receipt_no: await generateReceiptNo(tx, year),
        invoice_id: invoice.id,
        gateway: "CREDIT_BALANCE",
        amount: applied,
        status: "COMPLETED",
        paid_at: new Date(),
        notes: "Auto-applied from advance balance",
      },
    });
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { amount_paid: applied, status: applied >= invoice.amount_due ? "PAID" : "PARTIAL" },
    });
    await createAdvanceCreditConsumptionJournal(payment, updatedInvoice);
  }

  return { created: true };
}
