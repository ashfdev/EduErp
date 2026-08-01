import type { Prisma, PrismaClient, FeeStructure, Invoice } from "@education-erp/db";
import { generateInvoiceNo, generateReceiptNo } from "./fee-number.generator";
import { createAdvanceCreditConsumptionJournal } from "../accounts/auto-journal.service";
import { resolveFeeStructureClassIds } from "./fee-structure-scope";

type Tx = Prisma.TransactionClient | PrismaClient;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The one shared "which billing period is this invoice for" label -- e.g.
// "July 2026" for a monthly invoice, "2026" for a yearly one with no
// specific month, "One-time" for an ad-hoc/exam/admission invoice. Was
// previously computed inline only inside the Collect Fee workspace
// endpoint, so every other screen showing the same invoices (the Invoices
// list, a student's profile Fees tab, the portal Fees page, printed
// receipts) showed a bare "Class 9 Monthly Tuition" with no way to tell
// which month it actually covered without cross-referencing the due date.
export function formatFeePeriod(month: number | null | undefined, year: number | null | undefined): string {
  if (month && year) return `${MONTH_NAMES[month - 1]} ${year}`;
  if (year) return `${year}`;
  return "One-time";
}

type WaiverWithType = Prisma.StudentWaiverGetPayload<{ include: { waiver_type: true } }>;

// The one shared, idempotent primitive both applyWaiversToInvoice (below,
// every waiver -> one fresh invoice) and applyWaiverToExistingInvoices
// (fees.routes.ts, one newly-assigned waiver -> every matching existing
// invoice) build on. Guarded by an InvoiceWaiverApplication existence check
// so calling this a second time for the same (invoice, waiver) pair is a
// safe no-op -- without this, retroactively re-running a student's waiver
// set against an invoice it was already applied to would double-discount
// it. Also recomputes status: a waiver applied AFTER a partial payment was
// already made can bring amount_due down to or below what's already paid,
// which should flip the invoice to PAID immediately, not leave it stuck
// PARTIAL/OVERDUE until someone happens to reload it.
async function applySingleWaiverToInvoice(tx: Tx, invoice: Invoice, waiver: WaiverWithType): Promise<Invoice> {
  const applicable = waiver.waiver_type.applicable_categories as string[];
  if (applicable.length > 0 && !applicable.includes(invoice.category)) return invoice;
  if (invoice.amount_due <= 0) return invoice;

  const already = await tx.invoiceWaiverApplication.findFirst({ where: { invoice_id: invoice.id, student_waiver_id: waiver.id } });
  if (already) return invoice;

  const rawDiscount =
    waiver.waiver_type.discount_type === "PERCENTAGE" ? invoice.amount_due * (waiver.waiver_type.discount_value / 100) : waiver.waiver_type.discount_value;
  const discount = Math.min(Math.round(rawDiscount * 100) / 100, invoice.amount_due);
  if (discount <= 0) return invoice;

  await tx.invoiceWaiverApplication.create({
    data: { invoice_id: invoice.id, student_waiver_id: waiver.id, discount_amount: discount },
  });
  const newAmountDue = invoice.amount_due - discount;
  const newStatus =
    invoice.status === "PENDING" || invoice.status === "PARTIAL" || invoice.status === "OVERDUE"
      ? invoice.amount_paid >= newAmountDue + invoice.fine_amount
        ? "PAID"
        : invoice.amount_paid > 0
          ? "PARTIAL"
          : invoice.status
      : invoice.status;
  return tx.invoice.update({ where: { id: invoice.id }, data: { amount_due: newAmountDue, status: newStatus } });
}

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
    current = await applySingleWaiverToInvoice(tx, current, w);
  }
  return current;
}

// The other direction: a waiver just assigned to a student today shouldn't
// only affect invoices generated from now on -- a real, currently-owed
// invoice (this month's tuition, say) sitting unpaid at the moment of
// assignment is exactly the case a staff member assigning a waiver expects
// to see reflected immediately. Scoped to invoices not yet settled
// (PENDING/PARTIAL/OVERDUE -- a PAID or WAIVED invoice is left alone, and a
// year-scoped waiver only touches invoices in that same academic year).
// Reuses the same idempotent per-waiver primitive, so calling this twice
// for the same waiver (e.g. a retry) never double-discounts.
export async function applyWaiverToExistingInvoices(tx: Tx, waiver: WaiverWithType): Promise<{ invoicesAffected: number; totalDiscount: number }> {
  const invoices = await tx.invoice.findMany({
    where: {
      student_id: waiver.student_id,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      ...(waiver.academic_year_id && { academic_year_id: waiver.academic_year_id }),
    },
  });

  let invoicesAffected = 0;
  let totalDiscount = 0;
  for (const invoice of invoices) {
    const updated = await applySingleWaiverToInvoice(tx, invoice, waiver);
    const discount = invoice.amount_due - updated.amount_due;
    if (discount > 0) {
      invoicesAffected++;
      totalDiscount += discount;
    }
  }
  return { invoicesAffected, totalDiscount: Math.round(totalDiscount * 100) / 100 };
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
  // Deliberately NO try/catch around this create() -- both real callers
  // (runMonthlyFeeGeneration's per-student loop, admission-enroll's
  // monthly-structure loop) invoke this function using a `tx` that's
  // already mid-way through a larger shared transaction with more work
  // still to come after it. Postgres poisons an ENTIRE transaction the
  // moment any statement inside it errors -- every subsequent statement on
  // the same `tx` fails with "current transaction is aborted" (25P02)
  // regardless of whether the error was "handled" in JS. Catching a P2002
  // here and returning {created:false} would silently proceed to the next
  // loop iteration (or admission's next step) still inside a poisoned
  // transaction, turning a rare, already-effectively-impossible-under-
  // today's-real-usage race into a guaranteed hard failure for everything
  // after it. The @@unique([student_id, fee_structure_id, month, year])
  // constraint is the real, sufficient protection here -- it guarantees the
  // DB can never contain a duplicate row, full stop. If a genuine
  // collision ever does occur, letting it throw and roll back the WHOLE
  // containing transaction (generation batch / enrollment) is the correct,
  // safe outcome -- the caller can simply retry the whole operation -- not
  // something to paper over mid-transaction.
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

// Shared by POST /invoices/generate-bulk-monthly (the manual admin button,
// unchanged) and the new scheduled job (Plan Twenty-One, Phase A) — one
// place for the actual generation loop so a real cron trigger can never
// drift from what the manual button already does. Every active MONTHLY
// FeeStructure for the given year, resolved against every active student
// it applies to, via the same idempotent createMonthlyInvoiceIfMissing
// used everywhere else fee generation happens.
export async function runMonthlyFeeGeneration(
  tx: Tx,
  academicYearId: string,
  month: number,
  year: number,
): Promise<{ created: number; skipped: number }> {
  const structures = await tx.feeStructure.findMany({ where: { academic_year_id: academicYearId, frequency: "MONTHLY", is_active: true } });

  let created = 0;
  let skipped = 0;
  for (const structure of structures) {
    const classIds = await resolveFeeStructureClassIds(tx, structure);
    const students = await tx.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        ...(classIds && { current_class_id: { in: classIds } }),
        ...(structure.section_id && { current_section_id: structure.section_id }),
      },
    });
    for (const student of students) {
      const result = await createMonthlyInvoiceIfMissing(tx, student.id, structure, month, year);
      if (result.created) created++;
      else skipped++;
    }
  }

  return { created, skipped };
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

  const invoice = await tx.invoice.create({
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
  // Same waiver auto-apply as every other invoice-creation path (Plan
  // Twenty-One follow-up) -- a waiver whose applicable_categories includes
  // READMISSION (or is empty = all categories) must actually reduce this
  // invoice, not silently be ignored just because it was created here.
  await applyWaiversToInvoice(tx, invoice);
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
//
// Respects FeeRules.grace_period_days -- the same grace window
// calculateLateFee()/daysOverdue() (late-fee.ts) already use to decide when
// a fine starts accruing. Before this, the OVERDUE badge flipped red the
// instant due_date passed while the fine stayed ৳0 for the whole grace
// window, reading as a contradiction to whoever saw it.
export async function syncOverdueInvoices(tx: Tx, studentId?: string): Promise<void> {
  const rules = await tx.feeRules.findUnique({ where: { id: "singleton" } });
  const graceDeadlineCutoff = new Date();
  graceDeadlineCutoff.setDate(graceDeadlineCutoff.getDate() - (rules?.grace_period_days ?? 0));

  await tx.invoice.updateMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] },
      due_date: { lt: graceDeadlineCutoff },
      ...(studentId && { student_id: studentId }),
    },
    data: { status: "OVERDUE" },
  });
}
