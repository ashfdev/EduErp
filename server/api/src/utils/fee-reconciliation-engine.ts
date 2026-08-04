import type { Prisma, PrismaClient, FeeCategory } from "@education-erp/db";
import { buildFeeStructureStudentWhere } from "../modules/fees/fee-structure-scope";
import { formatFeePeriod } from "../modules/fees/invoice-helpers";

type Tx = Prisma.TransactionClient | PrismaClient;

// Plan Twenty-Four -- Fee Reconciliation & Assurance. These three functions
// are pure reads: they never create, edit, or delete an Invoice/
// FeeStructure/FeeStructureStudent row, and never auto-assign anything. Each
// returns a list of candidate findings for a human to review; persisting and
// acting on them is entirely the caller's job (fee-reconciliation.job.ts /
// reconciliation.routes.ts), not this file's.

export interface ReconciliationFindingInput {
  type: "COVERAGE_GAP" | "UNEXPECTED_INVOICE" | "ASSIGNMENT_GAP" | "AMOUNT_VARIANCE";
  student_id?: string | null;
  fee_structure_id?: string | null;
  invoice_id?: string | null;
  class_id?: string | null;
  section_id?: string | null;
  group_id?: string | null;
  expected_amount?: number | null;
  actual_amount?: number | null;
  description: string;
}

export interface StructureCoverageSummaryInput {
  fee_structure_id: string;
  structure_name: string;
  category: string;
  frequency: string;
  assignment_summary: string;
  expected_count: number;
  invoiced_count: number;
}

// Human-readable "who is this fee actually assigned to" -- the direct
// answer to "is a Missing Invoice happening because the class was never
// assigned this fee, or for some other reason." By construction, a
// COVERAGE_GAP finding can only ever exist for a student this function
// already says IS assigned (findCoverageGaps only checks students inside
// buildFeeStructureStudentWhere's own result) -- so the honest answer for
// every Missing Invoice finding is "assignment exists, invoicing was never
// run," never "not assigned." This string makes that visible without
// requiring a second cross-reference.
async function describeAssignmentScope(tx: Tx, structure: { id: string; class_id: string | null; section_id: string | null }): Promise<string> {
  const classRows = await tx.feeStructureClass.findMany({
    where: { fee_structure_id: structure.id },
    include: { class: { select: { name_en: true } }, group: { select: { name_en: true } } },
  });
  const individualCount = await tx.feeStructureStudent.count({ where: { fee_structure_id: structure.id } });

  const parts: string[] = [];
  if (classRows.length > 0) {
    parts.push(...classRows.map((r) => (r.group ? `${r.class.name_en} → ${r.group.name_en} group` : `${r.class.name_en} (all sections)`)));
  } else if (structure.class_id) {
    const cls = await tx.class.findUnique({ where: { id: structure.class_id }, select: { name_en: true } });
    const sec = structure.section_id ? await tx.section.findUnique({ where: { id: structure.section_id }, select: { name: true } }) : null;
    if (cls) parts.push(`${cls.name_en}${sec ? ` → Section ${sec.name}` : " (all sections)"}`);
  }
  if (individualCount > 0) parts.push(`${individualCount} individually-assigned student(s)`);
  if (parts.length === 0) return "All active students (no class/group scoping set on this structure)";
  return parts.join(" + ");
}

// "Is invoice generation actually reaching everyone it should?" -- for every
// active FeeStructure, resolve the roster it applies to via
// buildFeeStructureStudentWhere (the exact same resolver every real
// invoice-generation call site already uses -- runMonthlyFeeGeneration,
// /invoices/generate -- so "expected" here can never silently drift from
// what generation itself considers "applies to this student"), then diff it
// against who's actually been invoiced. MONTHLY structures are checked for
// this specific month/year; YEARLY/ONE_TIME structures have no natural
// "period" in the same sense, so they're checked for "has this student ever
// been invoiced against this structure this academic year" instead.
//
// ADMISSION/FORM/READMISSION/EXAM are deliberately excluded -- confirmed via
// a live run against real data, not assumed. A structure in these
// categories is legitimately scoped to a class the same way a recurring fee
// is (e.g. "Class 6 Admission Fee"), but it's only ever meant to invoice the
// specific student who triggered that lifecycle event (a fresh admission
// via admission.routes.ts's enroll handler, a promotion via
// invoiceReadmissionFeeIfConfigured, a specific exam's fee-generation run)
// -- never "whoever currently occupies that class," which is what
// buildFeeStructureStudentWhere resolves. A student promoted INTO Class 6
// from Class 5 correctly has no "Class 6 Admission Fee" invoice and never
// should -- flagging that as a gap would be pure noise at real-data scale
// (this exact false-positive pattern accounted for the overwhelming
// majority of findings on the first live run before this exclusion existed).
const NON_RECURRING_CATEGORIES: FeeCategory[] = ["ADMISSION", "FORM", "READMISSION", "EXAM"];

export interface CoverageResult {
  findings: ReconciliationFindingInput[];
  structureSummaries: StructureCoverageSummaryInput[];
}

export async function findCoverageGaps(tx: Tx, academicYearId: string, month: number, year: number): Promise<CoverageResult> {
  const findings: ReconciliationFindingInput[] = [];
  const structureSummaries: StructureCoverageSummaryInput[] = [];
  const structures = await tx.feeStructure.findMany({
    where: { academic_year_id: academicYearId, is_active: true, category: { notIn: NON_RECURRING_CATEGORIES } },
  });

  for (const structure of structures) {
    const scopeWhere = await buildFeeStructureStudentWhere(tx, structure);
    const expectedStudents = await tx.student.findMany({
      where: { deleted_at: null, status: "ACTIVE", ...scopeWhere },
      select: { id: true, name_en: true, current_class_id: true, current_section_id: true, group_id: true },
    });
    const assignmentSummary = await describeAssignmentScope(tx, structure);

    const invoiceWhere: Prisma.InvoiceWhereInput =
      structure.frequency === "MONTHLY" ? { fee_structure_id: structure.id, month, year } : { fee_structure_id: structure.id, academic_year_id: academicYearId };
    const actualInvoices = await tx.invoice.findMany({ where: invoiceWhere, select: { student_id: true } });
    const actualIds = new Set(actualInvoices.map((i) => i.student_id).filter((id): id is string => !!id));

    // Recorded even for a structure with zero expected students (e.g. a
    // class-scoped structure whose class has no active students left) --
    // this is exactly the kind of "assigned to nobody real" state the
    // coverage overview should surface, not silently skip.
    structureSummaries.push({
      fee_structure_id: structure.id,
      structure_name: structure.name,
      category: structure.category,
      frequency: structure.frequency,
      assignment_summary: assignmentSummary,
      expected_count: expectedStudents.length,
      invoiced_count: actualIds.size,
    });

    if (expectedStudents.length === 0) continue;
    const expectedById = new Map(expectedStudents.map((s) => [s.id, s]));
    const periodLabel = structure.frequency === "MONTHLY" ? formatFeePeriod(month, year) : "this academic year";

    for (const student of expectedStudents) {
      if (!actualIds.has(student.id)) {
        findings.push({
          type: "COVERAGE_GAP",
          student_id: student.id,
          fee_structure_id: structure.id,
          class_id: student.current_class_id,
          section_id: student.current_section_id,
          group_id: student.group_id,
          description: `${student.name_en} — no invoice for "${structure.name}" (${periodLabel}). Assigned via: ${assignmentSummary}. The fee IS correctly assigned — it just hasn't been generated into an invoice yet.`,
        });
      }
    }

    const unexpectedIds = [...actualIds].filter((id) => !expectedById.has(id));
    if (unexpectedIds.length > 0) {
      const unexpectedStudents = await tx.student.findMany({
        where: { id: { in: unexpectedIds } },
        select: { id: true, name_en: true, current_class_id: true, current_section_id: true, group_id: true },
      });
      for (const student of unexpectedStudents) {
        findings.push({
          type: "UNEXPECTED_INVOICE",
          student_id: student.id,
          fee_structure_id: structure.id,
          class_id: student.current_class_id,
          section_id: student.current_section_id,
          group_id: student.group_id,
          description: `${student.name_en} was invoiced for "${structure.name}" (${periodLabel}) but no longer matches this structure's current scope (${assignmentSummary}) — check if they moved after billing`,
        });
      }
    }
  }
  return { findings, structureSummaries };
}

// "Did we forget to individually assign a fee to someone?" -- a class/
// section/group-wide fee can't structurally have a "missing student" case
// (feeStructureAppliesToStudent resolves it purely off the student's own
// class/section/group data), so the real failure mode is an INDIVIDUALLY
// assigned fee (FeeStructureStudent -- a makeup-exam fee, a one-off levy)
// added for most of a cohort and forgotten for one. Empirical, not rule-
// based: for any FeeStructure whose individual assignment covers at least
// minorityThreshold of a class+section+group cohort's active students, flag
// any student in that same cohort who's missing it as a review candidate --
// never auto-added.
export async function findAssignmentGaps(tx: Tx, academicYearId: string, minorityThreshold = 0.5): Promise<ReconciliationFindingInput[]> {
  const findings: ReconciliationFindingInput[] = [];

  const individualStructures = await tx.feeStructure.findMany({
    where: { academic_year_id: academicYearId, is_active: true, students: { some: {} } },
    include: { students: { select: { student_id: true } } },
  });

  for (const structure of individualStructures) {
    const assignedIds = new Set(structure.students.map((s) => s.student_id));
    const assignedStudents = await tx.student.findMany({
      where: { id: { in: [...assignedIds] } },
      select: { id: true, current_class_id: true, current_section_id: true, group_id: true },
    });

    type Cohort = { class_id: string; section_id: string | null; group_id: string | null; assignedCount: number };
    const cohorts = new Map<string, Cohort>();
    for (const s of assignedStudents) {
      if (!s.current_class_id) continue; // no cohort to compare against
      const key = `${s.current_class_id}::${s.current_section_id ?? "none"}::${s.group_id ?? "none"}`;
      const entry = cohorts.get(key) ?? { class_id: s.current_class_id, section_id: s.current_section_id, group_id: s.group_id, assignedCount: 0 };
      entry.assignedCount++;
      cohorts.set(key, entry);
    }

    for (const cohort of cohorts.values()) {
      const cohortStudents = await tx.student.findMany({
        where: { deleted_at: null, status: "ACTIVE", current_class_id: cohort.class_id, current_section_id: cohort.section_id, group_id: cohort.group_id },
        select: { id: true, name_en: true },
      });
      if (cohortStudents.length === 0) continue;
      // Not a clear enough majority pattern in this cohort to treat the rest
      // as a likely oversight -- e.g. 2 of 30 having it is probably a
      // deliberate, targeted charge, not something everyone else missed.
      if (cohort.assignedCount / cohortStudents.length < minorityThreshold) continue;

      for (const student of cohortStudents) {
        if (!assignedIds.has(student.id)) {
          findings.push({
            type: "ASSIGNMENT_GAP",
            student_id: student.id,
            fee_structure_id: structure.id,
            class_id: cohort.class_id,
            section_id: cohort.section_id,
            group_id: cohort.group_id,
            description: `${student.name_en} — ${cohort.assignedCount} of ${cohortStudents.length} classmates have "${structure.name}" assigned; this student doesn't. Was this intentional?`,
          });
        }
      }
    }
  }

  return findings;
}

// "eki class e ekjn beshi dilo, ekjn kom dilo" -- within the same class/
// section/group, is anyone paying (owing) an amount that doesn't match what
// their fee + waivers should produce? Two-tier: for a structure-linked
// invoice there's a real formula to check against (structure.amount minus
// this invoice's own actually-applied waiver discounts), so recompute and
// compare directly rather than guessing from peers. For an ad-hoc/manual
// invoice (no structure, no formula) peer-cohort comparison is the only
// available signal -- group by (description, class, section, group) and
// flag anything far from that cohort's own median.
export async function findAmountVariances(tx: Tx, academicYearId: string, tolerance = 1): Promise<ReconciliationFindingInput[]> {
  const findings: ReconciliationFindingInput[] = [];

  const structureInvoices = await tx.invoice.findMany({
    where: { academic_year_id: academicYearId, fee_structure_id: { not: null } },
    include: {
      fee_structure: { select: { id: true, name: true, amount: true } },
      waiver_applications: { select: { discount_amount: true } },
      // Confirmed via a live investigation, not assumed: /collect-batch has
      // its own ad-hoc manual-discount field on a Payment (a staff-entered
      // one-off reduction, completely separate from the StudentWaiver
      // system), which directly lowers Invoice.amount_due at collection
      // time. The first version of this check only subtracted waiver
      // discounts and didn't know this second, equally legitimate discount
      // path existed -- it flagged two real, correctly-discounted invoices
      // as "mismatches" purely because of that gap. Only COMPLETED payments
      // count -- an INITIATED/FAILED payment's discount was never actually
      // applied to the invoice.
      payments: { where: { status: "COMPLETED" }, select: { discount_amount: true } },
      student: { select: { name_en: true, current_class_id: true, current_section_id: true, group_id: true } },
    },
  });

  for (const invoice of structureInvoices) {
    if (!invoice.fee_structure) continue;
    const waiverTotal = invoice.waiver_applications.reduce((sum, w) => sum + w.discount_amount, 0);
    const manualDiscountTotal = invoice.payments.reduce((sum, p) => sum + (p.discount_amount ?? 0), 0);
    const expected = Math.round((invoice.fee_structure.amount - waiverTotal - manualDiscountTotal) * 100) / 100;
    const actual = Math.round(invoice.amount_due * 100) / 100;
    if (Math.abs(expected - actual) > tolerance) {
      findings.push({
        type: "AMOUNT_VARIANCE",
        student_id: invoice.student_id,
        fee_structure_id: invoice.fee_structure.id,
        invoice_id: invoice.id,
        class_id: invoice.student?.current_class_id,
        section_id: invoice.student?.current_section_id,
        group_id: invoice.student?.group_id,
        expected_amount: expected,
        actual_amount: actual,
        description: `${invoice.student?.name_en ?? "Unknown payer"} — "${invoice.fee_structure.name}" invoice shows ৳${actual} due, expected ৳${expected} (structure amount minus applied waivers and manual discounts)`,
      });
    }
  }

  const manualInvoices = await tx.invoice.findMany({
    where: { academic_year_id: academicYearId, fee_structure_id: null, is_manual_fine: true },
    include: { student: { select: { name_en: true, current_class_id: true, current_section_id: true, group_id: true } } },
  });

  type ManualInvoice = (typeof manualInvoices)[number];
  const cohortGroups = new Map<string, ManualInvoice[]>();
  for (const inv of manualInvoices) {
    if (!inv.student?.current_class_id) continue;
    const key = `${inv.description}::${inv.student.current_class_id}::${inv.student.current_section_id ?? "none"}::${inv.student.group_id ?? "none"}`;
    const arr = cohortGroups.get(key) ?? [];
    arr.push(inv);
    cohortGroups.set(key, arr);
  }

  for (const group of cohortGroups.values()) {
    // Too small a cohort to establish a meaningful "normal" -- avoid false
    // positives from a genuinely one-off charge that just happens to share
    // its description with one other student.
    if (group.length < 3) continue;
    const amounts = group.map((i) => i.amount_due).sort((a, b) => a - b);
    // Safe: amounts.length === group.length >= 3 here (guarded above), so
    // this index is always in range -- TS can't see that guard, hence the
    // assertion rather than a semantically-meaningless `?? 0` fallback.
    const median = amounts[Math.floor(amounts.length / 2)]!;
    for (const inv of group) {
      if (Math.abs(inv.amount_due - median) > Math.max(tolerance, median * 0.1)) {
        findings.push({
          type: "AMOUNT_VARIANCE",
          student_id: inv.student_id,
          invoice_id: inv.id,
          class_id: inv.student?.current_class_id,
          section_id: inv.student?.current_section_id,
          group_id: inv.student?.group_id,
          expected_amount: median,
          actual_amount: Math.round(inv.amount_due * 100) / 100,
          description: `${inv.student?.name_en ?? "Unknown payer"} — "${inv.description}" is ৳${inv.amount_due}, but classmates with the same manual charge are around ৳${median}. Check for a data-entry error.`,
        });
      }
    }
  }

  return findings;
}

export interface ReconciliationSweepResult {
  findings: ReconciliationFindingInput[];
  structureSummaries: StructureCoverageSummaryInput[];
  coverageGapCount: number;
  unexpectedInvoiceCount: number;
  assignmentGapCount: number;
  amountVarianceCount: number;
}

// The one place all three checks are actually run together -- both the
// scheduled job and the manual "Run Now" route call this, so they can never
// drift from producing the same findings for the same data (same discipline
// as runMonthlyFeeGeneration being shared by its own manual button + job).
//
// Deliberately called with the plain `prisma` client, never an active
// interactive transaction -- these are pure reads with no cross-check
// consistency requirement (a nightly sweep doesn't need all three checks to
// see a perfectly identical snapshot of the DB), and Prisma's interactive
// transactions don't support genuinely concurrent queries on the same `tx`
// handle, which the Promise.all below relies on. The caller wraps only the
// PERSISTENCE step (writing the FeeReconciliationRun + its findings) in its
// own short transaction.
export async function runFeeReconciliationSweep(tx: Tx, academicYearId: string, month: number, year: number): Promise<ReconciliationSweepResult> {
  const [coverage, assignment, variance] = await Promise.all([
    findCoverageGaps(tx, academicYearId, month, year),
    findAssignmentGaps(tx, academicYearId),
    findAmountVariances(tx, academicYearId),
  ]);

  return {
    findings: [...coverage.findings, ...assignment, ...variance],
    structureSummaries: coverage.structureSummaries,
    coverageGapCount: coverage.findings.filter((f) => f.type === "COVERAGE_GAP").length,
    unexpectedInvoiceCount: coverage.findings.filter((f) => f.type === "UNEXPECTED_INVOICE").length,
    assignmentGapCount: assignment.length,
    amountVarianceCount: variance.length,
  };
}
