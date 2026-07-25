import type { Prisma, PrismaClient, FeeStructure, Invoice } from "@education-erp/db";
import { generateInvoiceNo, generateReceiptNo } from "./fee-number.generator";
import { createAdvanceCreditConsumptionJournal } from "../accounts/auto-journal.service";

type Tx = Prisma.TransactionClient | PrismaClient;

// Auto-applies every active StudentWaiver the student holds that matches
// this invoice's category and academic year (Plan Thirteen, Phase F) --
// called once, right after a fresh invoice is created, before the advance-
// credit auto-apply below (so credit only ever covers what's genuinely
// still owed after any waiver discount). Multiple waivers stack (e.g. a
// scholarship + a sibling discount both apply), each computed against the
// amount remaining after prior waivers, never going below 0. Each
// application is traced via an InvoiceWaiverApplication row rather than
// opaquely mutating amount_due, since the Student-wise Waivers report
// (Phase G) needs this trail.
export async function applyWaiversToInvoice(tx: Tx, invoice: Invoice): Promise<Invoice> {
  const waivers = await tx.studentWaiver.findMany({
    where: {
      student_id: invoice.student_id,
      revoked_at: null,
      OR: [{ academic_year_id: null }, { academic_year_id: invoice.academic_year_id }],
      waiver_type: { is_active: true },
    },
    include: { waiver_type: true },
  });

  let current = invoice;
  for (const w of waivers) {
    const applicable = w.waiver_type.applicable_categories as string[];
    if (applicable.length > 0 && !applicable.includes(current.category)) continue;
    if (current.amount_due <= 0) break;

    const rawDiscount =
      w.waiver_type.discount_type === "PERCENTAGE" ? current.amount_due * (w.waiver_type.discount_value / 100) : w.waiver_type.discount_value;
    const discount = Math.min(Math.round(rawDiscount * 100) / 100, current.amount_due);
    if (discount <= 0) continue;

    await tx.invoiceWaiverApplication.create({
      data: { invoice_id: current.id, student_waiver_id: w.id, discount_amount: discount },
    });
    current = await tx.invoice.update({ where: { id: current.id }, data: { amount_due: { decrement: discount } } });
  }

  return current;
}

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
  let invoice = await tx.invoice.create({
    data: {
      invoice_no: await generateInvoiceNo(tx, year),
      student_id: studentId,
      fee_structure_id: structure.id,
      academic_year_id: structure.academic_year_id,
      category: structure.category,
      fee_sub_category_id: structure.fee_sub_category_id,
      description: structure.name,
      amount_due: structure.amount,
      due_date: dueDate,
      month,
      year,
    },
  });

  invoice = await applyWaiversToInvoice(tx, invoice);

  // Auto-absorb any available advance credit against this brand-new
  // invoice — a family that pre-paid ahead of time (Phase 81's /collect
  // overpayment path) shouldn't see it sit inertly while a fresh invoice
  // shows the full amount as newly due. Runs against amount_due as it
  // stands *after* any waiver discount above, so credit only ever covers
  // what's genuinely still owed.
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

// Promotion-triggered readmission fee — invoiced only if the destination
// class actually has an active READMISSION FeeStructure defined for the
// target academic year (mirrors the admission-enroll ADMISSION/FORM invoice
// pattern exactly). Naturally optional per-class through the same
// Settings-driven mechanism every other fee uses: a class with no
// READMISSION structure promotes fee-neutral, exactly as before this
// existed — no separate "does promotion charge a fee" toggle needed.
// Idempotent on (student_id, fee_structure_id, academic_year_id) so calling
// this twice for the same promotion never double-invoices.
export async function invoiceReadmissionFeeIfConfigured(
  tx: Tx,
  studentId: string,
  destinationClassId: string,
  destinationAcademicYearId: string,
): Promise<{ created: boolean }> {
  // Multi-class-aware (Phase N3) -- a READMISSION structure scoped via
  // FeeStructureClass rows (the `classes` relation) matches here exactly
  // like one scoped via the legacy class_id scalar.
  const structure = await tx.feeStructure.findFirst({
    where: {
      academic_year_id: destinationAcademicYearId,
      category: "READMISSION",
      is_active: true,
      OR: [{ class_id: destinationClassId }, { classes: { some: { class_id: destinationClassId } } }],
    },
  });
  if (!structure) return { created: false };

  const existing = await tx.invoice.findFirst({
    where: { student_id: studentId, fee_structure_id: structure.id, academic_year_id: destinationAcademicYearId },
  });
  if (existing) return { created: false };

  await tx.invoice.create({
    data: {
      invoice_no: await generateInvoiceNo(tx),
      student_id: studentId,
      fee_structure_id: structure.id,
      academic_year_id: destinationAcademicYearId,
      category: "READMISSION",
      fee_sub_category_id: structure.fee_sub_category_id,
      description: structure.name,
      amount_due: structure.amount,
      due_date: new Date(),
    },
  });
  return { created: true };
}

// InvoiceStatus.OVERDUE exists in the schema and is already relied on by
// several read-side filters (fee reports, analytics, document generation),
// but nothing ever transitioned an invoice into it — it was pure dead code,
// so a due invoice looked identical to one due next month everywhere it was
// displayed. Lazily synced on read rather than via a scheduled job (no cron
// infra exists in this codebase yet): call this at the top of any route that
// shows a student's (or the whole institution's) invoices, before the read
// query runs. Safe to call unconditionally — every payment-completion path
// (`payments.routes.ts`, `fees.routes.ts` /collect) already unconditionally
// recomputes status to PARTIAL/PAID off the current amount_paid regardless
// of what status was there before, so an invoice that was OVERDUE and then
// gets paid is never stuck.
export async function syncOverdueInvoices(tx: Tx, studentId?: string): Promise<void> {
  await tx.invoice.updateMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      due_date: { lt: new Date() },
      ...(studentId && { student_id: studentId }),
    },
    data: { status: "OVERDUE" },
  });
}
