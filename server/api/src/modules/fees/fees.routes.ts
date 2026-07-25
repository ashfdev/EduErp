import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import ExcelJS from "exceljs";
import type { Payment, Invoice } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { FEE_COLLECTION_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import {
  feeStructureSchema, feeCategorySchema, feeSubCategorySchema, feeFineRuleSchema, assignFeeStructureClassesSchema,
  generateInvoiceSchema, generateBulkMonthlySchema, collectPaymentSchema, collectBatchSchema, adHocInvoiceSchema,
  waiveInvoiceSchema, waiverTypeSchema, assignStudentWaiverSchema,
} from "@education-erp/validators";
import { sendSms } from "../../services/sms.service";
import { createFeeReceiptJournal } from "../accounts/auto-journal.service";
import { generateInvoiceNo, generateReceiptNo } from "./fee-number.generator";
import { createMonthlyInvoiceIfMissing, syncOverdueInvoices, applyWaiversToInvoice } from "./invoice-helpers";
import { feeStructureAppliesToStudent, resolveFeeStructureClassIds } from "./fee-structure-scope";
import { resolveFineForInvoice, describeFineSource } from "./fee-fine-engine";
import { logAudit } from "../../lib/audit-log";
import { ApiError, badRequest, conflict, notFound } from "../../lib/errors";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const feesRouter = Router();
feesRouter.use(authenticate);

// ── Fee Structures ──────────────────────────────────────────────

feesRouter.get(
  "/structures",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().optional(), class_id: z.string().optional() }).parse(req.query);
    const structures = await prisma.feeStructure.findMany({
      where: { ...(query.academic_year_id && { academic_year_id: query.academic_year_id }), ...(query.class_id && { class_id: query.class_id }) },
      include: {
        fee_sub_category: { select: { id: true, name: true } },
        classes: { include: { class: { select: { id: true, name_en: true } } } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: structures });
  }),
);

feesRouter.post(
  "/structures",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = feeStructureSchema.parse(req.body);
    const structure = await prisma.feeStructure.create({ data: body });
    res.status(201).json({ success: true, data: structure });
  }),
);

feesRouter.put(
  "/structures/:id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = feeStructureSchema.partial().parse(req.body);
    const structure = await prisma.feeStructure.update({ where: { id }, data: body });
    res.json({ success: true, data: structure });
  }),
);

feesRouter.delete(
  "/structures/:id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const hasInvoices = await prisma.invoice.findFirst({ where: { fee_structure_id: id } });
    if (hasInvoices) throw conflict("This fee structure has invoices generated and cannot be deleted");
    await prisma.feeStructure.delete({ where: { id } });
    res.status(204).send();
  }),
);

// Full-replace multi-class assignment for a single FeeStructure (Plan
// Fourteen, Phase N3) -- when rows exist here they win over the legacy
// class_id/section_id scalar, which is enforced null at write time below.
// Soft-warning-with-override overlap check mirrors section-capacity.ts's
// exact pattern (an error.code the frontend recognizes + resubmit-with-
// override, never a silent allow or a hard dead-end).
feesRouter.put(
  "/structures/:id/classes",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = assignFeeStructureClassesSchema.parse(req.body);
    const structure = await prisma.feeStructure.findUnique({ where: { id } });
    if (!structure) throw notFound("Fee structure not found");

    if (!body.override_overlap) {
      const overlapping = await prisma.feeStructureClass.findMany({
        where: {
          class_id: { in: body.class_ids },
          fee_structure_id: { not: id },
          fee_structure: { is_active: true, category: structure.category, fee_sub_category_id: structure.fee_sub_category_id },
        },
        include: { class: { select: { name_en: true } } },
      });
      if (overlapping.length > 0) {
        const names = [...new Set(overlapping.map((o) => o.class.name_en))].join(", ");
        throw new ApiError(400, "FEE_STRUCTURE_CLASS_OVERLAP", `${names} already assigned to another active "${structure.category}" fee structure. Continue anyway?`);
      }
    }

    const classes = await prisma.$transaction(async (tx) => {
      await tx.feeStructureClass.deleteMany({ where: { fee_structure_id: id } });
      await tx.feeStructureClass.createMany({ data: body.class_ids.map((class_id) => ({ fee_structure_id: id, class_id })) });
      await tx.feeStructure.update({ where: { id }, data: { class_id: null, section_id: null } });
      return tx.feeStructureClass.findMany({ where: { fee_structure_id: id }, include: { class: { select: { id: true, name_en: true } } } });
    });

    res.json({ success: true, data: classes });
  }),
);

// ── Fee Sub-Categories (Plan Fourteen, Phase N1) ──────────────────
// No hard-delete route, is_active toggle only -- mirrors WaiverType's exact
// lifecycle, since a historically-referenced catalog row must never
// disappear out from under old FeeStructure/Invoice rows.

feesRouter.get(
  "/sub-categories",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ category: feeCategorySchema.optional(), active_only: z.string().optional() }).parse(req.query);
    const subCategories = await prisma.feeSubCategory.findMany({
      where: { ...(query.category && { category: query.category }), ...(query.active_only === "true" && { is_active: true }) },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json({ success: true, data: subCategories });
  }),
);

feesRouter.post(
  "/sub-categories",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = feeSubCategorySchema.parse(req.body);
    const subCategory = await prisma.feeSubCategory.create({ data: body });
    res.status(201).json({ success: true, data: subCategory });
  }),
);

feesRouter.put(
  "/sub-categories/:id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = feeSubCategorySchema.partial().parse(req.body);
    const subCategory = await prisma.feeSubCategory.update({ where: { id }, data: body });
    res.json({ success: true, data: subCategory });
  }),
);

// ── Fee Fine Rules (Plan Fourteen, Phase N2) ──────────────────────
// No hard-delete route, is_active toggle only -- same lifecycle as
// FeeSubCategory above.

feesRouter.get(
  "/fine-rules",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().optional() }).parse(req.query);
    const rules = await prisma.feeFineRule.findMany({
      where: { ...(query.academic_year_id && { academic_year_id: query.academic_year_id }) },
      include: {
        fee_sub_category: { select: { id: true, name: true } },
        classes: { include: { class: { select: { id: true, name_en: true } } } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: rules });
  }),
);

feesRouter.post(
  "/fine-rules",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = feeFineRuleSchema.parse(req.body);
    if (body.scope_mode === "SUB_CATEGORY_FINE" && !body.fee_sub_category_id) {
      throw badRequest("A sub-category must be selected when Setup Fine For is Sub-Category");
    }
    if (body.applicable_for === "SPECIFIC_CLASSES" && !body.class_ids.length) {
      throw badRequest("Select at least one class for a class-specific fine rule");
    }
    const rule = await prisma.feeFineRule.create({
      data: {
        academic_year_id: body.academic_year_id,
        scope_mode: body.scope_mode,
        fee_category: body.fee_category,
        fee_sub_category_id: body.scope_mode === "SUB_CATEGORY_FINE" ? body.fee_sub_category_id : null,
        fine_value_type: body.fine_value_type,
        fine_value: body.fine_value,
        applicable_for: body.applicable_for,
        is_active: body.is_active,
        classes: body.applicable_for === "SPECIFIC_CLASSES" ? { create: body.class_ids.map((class_id) => ({ class_id })) } : undefined,
      },
      include: { classes: { include: { class: { select: { id: true, name_en: true } } } } },
    });
    res.status(201).json({ success: true, data: rule });
  }),
);

feesRouter.put(
  "/fine-rules/:id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = feeFineRuleSchema.partial().parse(req.body);
    const { class_ids, ...rest } = body;
    const rule = await prisma.$transaction(async (tx) => {
      if (class_ids !== undefined) {
        await tx.feeFineRuleClass.deleteMany({ where: { fine_rule_id: id } });
        if (class_ids.length) await tx.feeFineRuleClass.createMany({ data: class_ids.map((class_id) => ({ fine_rule_id: id, class_id })) });
      }
      return tx.feeFineRule.update({ where: { id }, data: rest, include: { classes: { include: { class: { select: { id: true, name_en: true } } } } } });
    });
    res.json({ success: true, data: rule });
  }),
);

// ── Invoice Generation ──────────────────────────────────────────

async function getFeeRules() {
  return prisma.feeRules.findUniqueOrThrow({ where: { id: "singleton" } });
}

feesRouter.post(
  "/invoices/generate",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = generateInvoiceSchema.parse(req.body);
    const structure = await prisma.feeStructure.findUnique({ where: { id: body.fee_structure_id } });
    if (!structure) throw notFound("Fee structure not found");

    // Multi-class-aware (Phase N3) -- when FeeStructureClass rows exist for
    // this structure they win over the legacy class_id scalar; section
    // filtering only applies to the legacy single-class form.
    const classIds = await resolveFeeStructureClassIds(prisma, structure);
    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        ...(body.student_ids?.length ? { id: { in: body.student_ids } } : {}),
        ...(classIds && { current_class_id: { in: classIds } }),
        ...(structure.section_id && { current_section_id: structure.section_id }),
      },
    });

    const now = new Date();
    const dueDate = new Date(body.year ?? now.getFullYear(), (body.month ?? now.getMonth() + 1) - 1, structure.due_day ?? 10);

    let created = 0;
    let skipped = 0;
    for (const student of students) {
      const existing = await prisma.invoice.findFirst({
        where: { student_id: student.id, fee_structure_id: structure.id, month: body.month ?? null, year: body.year ?? null },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const invoice = await prisma.invoice.create({
        data: {
          invoice_no: await generateInvoiceNo(prisma),
          student_id: student.id,
          fee_structure_id: structure.id,
          academic_year_id: structure.academic_year_id,
          category: structure.category,
          fee_sub_category_id: structure.fee_sub_category_id,
          description: structure.name,
          amount_due: structure.amount,
          due_date: dueDate,
          month: body.month,
          year: body.year,
        },
      });
      // Same waiver auto-apply as createMonthlyInvoiceIfMissing (Phase F) --
      // this route is a genuinely separate invoice-creation code path (a
      // real, confirmed gap found while live-testing: it doesn't share that
      // helper at all), so without this a waiver would silently not apply
      // whenever an admin generates invoices through this specific route.
      await applyWaiversToInvoice(prisma, invoice);
      created++;
    }

    await prisma.invoiceGenerationRun.create({
      data: { run_by_id: req.user!.sub, trigger: "MANUAL", created_count: created, skipped_count: skipped, academic_year_id: structure.academic_year_id, month: body.month, year: body.year },
    });

    res.json({ success: true, data: { created, skipped_duplicates: skipped } });
  }),
);

feesRouter.post(
  "/invoices/generate-bulk-monthly",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = generateBulkMonthlySchema.parse(req.body);
    const structures = await prisma.feeStructure.findMany({ where: { academic_year_id: body.academic_year_id, frequency: "MONTHLY", is_active: true } });

    let created = 0;
    let skipped = 0;
    for (const structure of structures) {
      // Multi-class-aware (Phase N3) -- see /invoices/generate for the same
      // resolution logic.
      const classIds = await resolveFeeStructureClassIds(prisma, structure);
      const students = await prisma.student.findMany({
        where: {
          deleted_at: null,
          status: "ACTIVE",
          ...(classIds && { current_class_id: { in: classIds } }),
          ...(structure.section_id && { current_section_id: structure.section_id }),
        },
      });
      for (const student of students) {
        const result = await createMonthlyInvoiceIfMissing(prisma, student.id, structure, body.month, body.year);
        if (result.created) created++;
        else skipped++;
      }
    }

    await prisma.invoiceGenerationRun.create({
      data: { run_by_id: req.user!.sub, trigger: "BULK_MONTHLY", created_count: created, skipped_count: skipped, academic_year_id: body.academic_year_id, month: body.month, year: body.year },
    });

    res.json({ success: true, data: { created, skipped_duplicates: skipped } });
  }),
);

// Staff-only. Portal callers (STUDENT/GUARDIAN) must go through the
// ownership-checked GET /api/portal/student/:id/fees instead — this route
// trusted a client-supplied student_id query param with no ownership check.
feesRouter.get(
  "/invoices",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ student_id: z.string().optional(), status: z.string().optional(), class_id: z.string().optional(), month: z.coerce.number().optional(), year: z.coerce.number().optional() }).parse(req.query);
    await syncOverdueInvoices(prisma, query.student_id);
    const invoices = await prisma.invoice.findMany({
      where: {
        ...(query.student_id && { student_id: query.student_id }),
        ...(query.status && { status: query.status as never }),
        ...(query.month != null && { month: query.month }),
        ...(query.year != null && { year: query.year }),
        ...(query.class_id && { student: { current_class_id: query.class_id } }),
      },
      include: { student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } } } } },
      orderBy: { due_date: "desc" },
    });
    res.json({ success: true, data: invoices });
  }),
);

feesRouter.get(
  "/invoices/:id",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, student: true } });
    if (!invoice) throw notFound("Invoice not found");
    res.json({ success: true, data: invoice });
  }),
);

feesRouter.put(
  "/invoices/:id/waive",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = waiveInvoiceSchema.parse(req.body);
    const invoice = await prisma.invoice.update({ where: { id }, data: { status: "WAIVED" } });
    await logAudit("FEE_WAIVE", { userId: req.user!.sub, targetType: "Invoice", targetId: id, metadata: { reason: body.reason }, req });
    res.json({ success: true, data: invoice, message: `Waived: ${body.reason}` });
  }),
);

// ── Waiver Types (reusable templates, Plan Thirteen, Phase F) ─────

feesRouter.get(
  "/waiver-types",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (_req, res) => {
    const types = await prisma.waiverType.findMany({ orderBy: { created_at: "desc" } });
    res.json({ success: true, data: types });
  }),
);

feesRouter.post(
  "/waiver-types",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = waiverTypeSchema.parse(req.body);
    const type = await prisma.waiverType.create({
      data: {
        name: body.name,
        description: body.description,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        applicable_categories: body.applicable_categories,
      },
    });
    res.status(201).json({ success: true, data: type });
  }),
);

feesRouter.put(
  "/waiver-types/:id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = waiverTypeSchema.partial().parse(req.body);
    const type = await prisma.waiverType.update({ where: { id }, data: body });
    res.json({ success: true, data: type });
  }),
);

// ── Student Waivers (assignments) ──────────────────────────────────

feesRouter.get(
  "/student-waivers",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ student_id: z.string().optional(), class_id: z.string().optional(), active_only: z.string().optional() }).parse(req.query);
    const waivers = await prisma.studentWaiver.findMany({
      where: {
        ...(query.student_id && { student_id: query.student_id }),
        ...(query.active_only === "true" && { revoked_at: null }),
        ...(query.class_id && { student: { current_class_id: query.class_id } }),
      },
      include: {
        student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } } } },
        waiver_type: true,
        academic_year: { select: { id: true, label: true } },
      },
      orderBy: { assigned_at: "desc" },
    });
    res.json({ success: true, data: waivers });
  }),
);

feesRouter.post(
  "/student-waivers",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = assignStudentWaiverSchema.parse(req.body);
    const [student, waiverType] = await Promise.all([
      prisma.student.findFirst({ where: { id: body.student_id, deleted_at: null } }),
      prisma.waiverType.findUnique({ where: { id: body.waiver_type_id } }),
    ]);
    if (!student) throw notFound("Student not found");
    if (!waiverType) throw notFound("Waiver type not found");

    const waiver = await prisma.studentWaiver.create({
      data: {
        student_id: body.student_id,
        waiver_type_id: body.waiver_type_id,
        academic_year_id: body.academic_year_id ?? null,
        assigned_by_id: req.user!.sub,
      },
    });
    await logAudit("FEE_WAIVE", { userId: req.user!.sub, targetType: "StudentWaiver", targetId: waiver.id, metadata: { student_id: body.student_id, waiver_type_id: body.waiver_type_id }, req });
    res.status(201).json({ success: true, data: waiver });
  }),
);

feesRouter.put(
  "/student-waivers/:id/revoke",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.studentWaiver.findUnique({ where: { id } });
    if (!existing) throw notFound("Waiver assignment not found");
    if (existing.revoked_at) throw badRequest("This waiver has already been revoked");

    const waiver = await prisma.studentWaiver.update({ where: { id }, data: { revoked_at: new Date(), revoked_by_id: req.user!.sub } });
    res.json({ success: true, data: waiver });
  }),
);

// ── Roster (collection entry point) ───────────────────────────────
// The class/section(/group)-filtered browse view backing the redesigned
// Collect Fee flow — a full roster (including students with zero dues),
// not just the ones with outstanding invoices (that's /reports/dues).

feesRouter.get(
  "/roster",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional(), group_id: z.string().optional() }).parse(req.query);
    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        current_class_id: query.class_id,
        ...(query.section_id && { current_section_id: query.section_id }),
        ...(query.group_id && { group_id: query.group_id }),
      },
      select: {
        id: true,
        name_en: true,
        student_uid: true,
        current_roll_no: true,
        invoices: { where: { status: { not: "WAIVED" } }, select: { amount_due: true, amount_paid: true, fine_amount: true } },
      },
      orderBy: [{ current_roll_no: "asc" }, { name_en: "asc" }],
    });

    const rows = students.map((s) => {
      const totalDue = s.invoices.reduce((sum, i) => sum + i.amount_due + i.fine_amount, 0);
      const totalPaid = s.invoices.reduce((sum, i) => sum + i.amount_paid, 0);
      const outstanding = Math.max(0, totalDue - totalPaid);
      const status = s.invoices.length === 0 ? "NO_INVOICE" : outstanding <= 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "DUE";
      return {
        id: s.id,
        name_en: s.name_en,
        student_uid: s.student_uid,
        current_roll_no: s.current_roll_no,
        total_due: totalDue,
        total_paid: totalPaid,
        outstanding,
        status,
      };
    });

    res.json({
      success: true,
      data: {
        students: rows,
        summary: {
          total_students: rows.length,
          with_dues: rows.filter((r) => r.outstanding > 0).length,
          fully_paid: rows.filter((r) => r.status === "PAID").length,
        },
      },
    });
  }),
);

// ── Collection (manual) ─────────────────────────────────────────

// This route is exclusively for staff recording money they've already
// physically/directly confirmed receiving (counter cash, a verified bank
// transfer, a wallet payment confirmed some other way) — `gateway` here is
// a descriptive/reporting field, never a dispatch key into
// getPaymentAdapter(). Routing this through the adapter registry (as this
// route used to) would either trivially complete (CASH) or — for
// BKASH/NAGAD/ROCKET/BANK_TRANSFER, whose adapters return INITIATED or
// FAILED when the real gateway isn't configured — silently create a
// payment that never actually completes despite staff being told they'd
// recorded it. See completePayment() (payments.routes.ts) for the
// self-service flow this deliberately does not touch.
feesRouter.post(
  "/collect",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = collectPaymentSchema.parse(req.body);
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoice_id } });
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status === "PAID") throw badRequest("Invoice is already fully paid");

    const student = await prisma.student.findUnique({ where: { id: invoice.student_id } });
    const rules = await getFeeRules();
    // Class/sub-category-scoped fine engine (Phase N2) -- falls back to the
    // unmodified calculateLateFee() when no FeeFineRule matches, so a
    // category/class that never opts in sees byte-identical behavior.
    const fine = await resolveFineForInvoice(prisma, invoice, student?.current_class_id ?? null, rules);

    // An amount beyond what's actually owed on this invoice is an
    // overpayment, not a bigger payment against it — Invoice.amount_paid
    // must never exceed amount_due + fine (that's what silently produced a
    // confusing >100%-paid invoice before this check existed). Without
    // advance_payment_allowed, reject outright; with it, cap what applies
    // here and bank the rest as the student's credit_balance.
    const outstanding = Math.max(0, invoice.amount_due + fine - invoice.amount_paid);
    if (body.amount > outstanding && !rules.advance_payment_allowed) {
      throw badRequest(`Amount exceeds the outstanding balance (৳${outstanding}). Enable advance payments in Fee Rules to accept overpayment as credit.`);
    }
    const appliedToInvoice = Math.min(body.amount, outstanding);
    const overflow = body.amount - appliedToInvoice;

    const payment = await prisma.payment.create({
      data: {
        receipt_no: await generateReceiptNo(prisma),
        invoice_id: invoice.id,
        gateway: body.gateway,
        amount: body.amount,
        status: "COMPLETED",
        paid_at: new Date(),
        notes: body.notes,
        collected_by_id: req.user!.sub,
      },
    });

    const newAmountPaid = invoice.amount_paid + appliedToInvoice;
    const newStatus = newAmountPaid >= invoice.amount_due + fine ? "PAID" : newAmountPaid > 0 ? "PARTIAL" : invoice.status;

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { amount_paid: newAmountPaid, fine_amount: fine, status: newStatus },
    });

    if (overflow > 0) {
      await prisma.student.update({ where: { id: invoice.student_id }, data: { credit_balance: { increment: overflow } } });
    }

    await createFeeReceiptJournal(payment, updated, appliedToInvoice);

    if (student?.father_phone) {
      await sendSms(
        student.father_phone,
        overflow > 0
          ? `Payment of ৳${body.amount} received for ${student.name_en}. ৳${overflow} credited as advance balance. Thank you.`
          : `Payment of ৳${body.amount} received for ${student.name_en}. Thank you.`,
      );
    }

    res.json({ success: true, data: { payment, invoice: updated, credit_applied: overflow } });
  }),
);

// ── Fee Collection workspace (Plan Fourteen, Phase N4) ────────────
// The redesigned Fee Collection page's data source -- due lines with
// computed period labels, receivable amounts (fine resolved via the new
// engine), and existing waiver applications shown as distinct read-only
// rows with a "why" annotation. This route is purely additive; the
// existing single-invoice /collect route above stays completely untouched
// as a fallback.

feesRouter.get(
  "/collect-workspace/:student_id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const student = await prisma.student.findFirst({
      where: { id: studentId, deleted_at: null },
      select: { id: true, name_en: true, student_uid: true, current_class_id: true, current_section_id: true, credit_balance: true },
    });
    if (!student) throw notFound("Student not found");

    await syncOverdueInvoices(prisma, studentId);
    const rules = await getFeeRules();

    const invoices = await prisma.invoice.findMany({
      where: { student_id: studentId, status: { notIn: ["PAID", "WAIVED"] } },
      include: {
        fee_sub_category: { select: { name: true } },
        waiver_applications: { include: { student_waiver: { include: { waiver_type: { select: { name: true } } } } } },
      },
      orderBy: { due_date: "asc" },
    });

    const lines = await Promise.all(
      invoices.map(async (inv) => {
        const fine = await resolveFineForInvoice(prisma, inv, student.current_class_id, rules);
        const fineSource = fine > 0 ? await describeFineSource(prisma, inv, student.current_class_id, rules) : null;
        const outstanding = Math.max(0, inv.amount_due + fine - inv.amount_paid);
        const period = inv.month && inv.year ? `${MONTH_NAMES[inv.month - 1]} ${inv.year}` : inv.year ? `${inv.year}` : "One-time";
        return {
          invoice_id: inv.id,
          category: inv.category,
          sub_category: inv.fee_sub_category?.name ?? null,
          description: inv.description,
          period,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          fine_amount: fine,
          fine_source: fineSource,
          outstanding,
          is_manual_fine: inv.is_manual_fine,
          waivers: inv.waiver_applications.map((w) => ({ waiver_name: w.student_waiver.waiver_type.name, discount_amount: w.discount_amount })),
        };
      }),
    );

    res.json({
      success: true,
      data: { student: { id: student.id, name_en: student.name_en, student_uid: student.student_uid }, credit_balance: student.credit_balance, lines },
    });
  }),
);

// "Generate Fees of [name]" -- idempotent via the unmodified
// createMonthlyInvoiceIfMissing, logs a new STUDENT_ON_DEMAND
// InvoiceGenerationRun trigger.
feesRouter.post(
  "/generate-for-student/:student_id",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const student = await prisma.student.findFirst({ where: { id: studentId, deleted_at: null } });
    if (!student) throw notFound("Student not found");
    if (!student.current_class_id) throw badRequest("This student has no current class assigned");

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    if (!activeYear) throw badRequest("No active academic year configured");

    const structures = await prisma.feeStructure.findMany({ where: { academic_year_id: activeYear.id, is_active: true, frequency: "MONTHLY" } });
    const now = new Date();
    let created = 0;
    let skipped = 0;
    for (const structure of structures) {
      if (!(await feeStructureAppliesToStudent(prisma, structure, student.current_class_id, student.current_section_id))) continue;
      const result = await createMonthlyInvoiceIfMissing(prisma, studentId, structure, now.getMonth() + 1, now.getFullYear());
      if (result.created) created++;
      else skipped++;
    }

    await prisma.invoiceGenerationRun.create({
      data: {
        run_by_id: req.user!.sub, trigger: "STUDENT_ON_DEMAND", created_count: created, skipped_count: skipped,
        academic_year_id: activeYear.id, month: now.getMonth() + 1, year: now.getFullYear(),
      },
    });

    res.json({ success: true, data: { created, skipped_duplicates: skipped } });
  }),
);

// Multi-line "Receive Fee" submit -- one $transaction across every line,
// reusing the same fine-engine resolution and advance-credit handling as
// the single-invoice /collect route above. N Payment rows share one new
// receipt_batch_id grouping key; each still gets its own unique receipt_no
// (a single shared receipt *number* across a batch would need a bigger
// change to receipt_no's uniqueness semantics -- out of scope here).
// Journal entries fire once the batch commits, one per line, matching the
// established sequencing already used by the single-invoice route above
// (createFeeReceiptJournal always runs against the plain prisma client,
// never nested inside a $transaction).
feesRouter.post(
  "/collect-batch",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = collectBatchSchema.parse(req.body);
    const rules = await getFeeRules();
    const batchId = randomUUID();

    const result = await prisma.$transaction(async (tx) => {
      const lines: { payment: Payment; invoice: Invoice; overflow: number }[] = [];
      let studentId: string | null = null;

      for (const line of body.lines) {
        const invoice = await tx.invoice.findUnique({ where: { id: line.invoice_id } });
        if (!invoice) throw notFound(`Invoice ${line.invoice_id} not found`);
        if (invoice.status === "PAID") throw badRequest(`"${invoice.description}" is already fully paid`);
        studentId = invoice.student_id;

        const invStudent = await tx.student.findUnique({ where: { id: invoice.student_id }, select: { current_class_id: true } });
        const fine = await resolveFineForInvoice(tx, invoice, invStudent?.current_class_id ?? null, rules);

        const discount = Math.min(line.discount_amount ?? 0, invoice.amount_due);
        const effectiveAmountDue = Math.max(0, invoice.amount_due - discount);
        const outstanding = Math.max(0, effectiveAmountDue + fine - invoice.amount_paid);
        if (line.amount > outstanding && !rules.advance_payment_allowed) {
          throw badRequest(`Amount for "${invoice.description}" exceeds the outstanding balance (৳${outstanding}).`);
        }
        const appliedToInvoice = Math.min(line.amount, outstanding);
        const overflow = line.amount - appliedToInvoice;

        const payment = await tx.payment.create({
          data: {
            receipt_no: await generateReceiptNo(tx),
            invoice_id: invoice.id,
            gateway: body.gateway,
            amount: line.amount,
            status: "COMPLETED",
            paid_at: new Date(),
            notes: body.notes,
            collected_by_id: req.user!.sub,
            receipt_batch_id: batchId,
            discount_amount: discount > 0 ? discount : null,
            secondary_receipt_no: body.secondary_receipt_no,
          },
        });

        const newAmountPaid = invoice.amount_paid + appliedToInvoice;
        const newStatus = newAmountPaid >= effectiveAmountDue + fine ? "PAID" : newAmountPaid > 0 ? "PARTIAL" : invoice.status;

        const updated = await tx.invoice.update({
          where: { id: invoice.id },
          data: { amount_due: effectiveAmountDue, amount_paid: newAmountPaid, fine_amount: fine, status: newStatus },
        });

        if (overflow > 0) {
          await tx.student.update({ where: { id: invoice.student_id }, data: { credit_balance: { increment: overflow } } });
        }

        lines.push({ payment, invoice: updated, overflow });
      }

      return { lines, studentId };
    });

    let totalOverflow = 0;
    for (const { payment, invoice, overflow } of result.lines) {
      await createFeeReceiptJournal(payment, invoice, payment.amount - overflow);
      totalOverflow += overflow;
    }

    if (body.send_sms && result.studentId) {
      const smsStudent = await prisma.student.findUnique({ where: { id: result.studentId } });
      if (smsStudent?.father_phone) {
        const total = body.lines.reduce((sum, l) => sum + l.amount, 0);
        await sendSms(smsStudent.father_phone, `Payment of ৳${total} received for ${smsStudent.name_en} (${result.lines.length} item(s)). Thank you.`);
      }
    }

    res.json({
      success: true,
      data: { receipt_batch_id: batchId, payments: result.lines.map((l) => l.payment), credit_applied: totalOverflow },
    });
  }),
);

// "Add One-Time Fee" / "Add Fine" -- creates a fee_structure_id: null
// invoice (already schema-legal today). Deliberately skips the waiver
// auto-apply: this is a one-off, staff-typed amount for a specific case,
// not a recurring structure-driven invoice a standing waiver should
// silently discount.
feesRouter.post(
  "/invoices/ad-hoc",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = adHocInvoiceSchema.parse(req.body);
    const student = await prisma.student.findFirst({ where: { id: body.student_id, deleted_at: null } });
    if (!student) throw notFound("Student not found");

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    if (!activeYear) throw badRequest("No active academic year configured");

    const invoice = await prisma.invoice.create({
      data: {
        invoice_no: await generateInvoiceNo(prisma),
        student_id: body.student_id,
        academic_year_id: activeYear.id,
        category: body.category,
        fee_sub_category_id: body.fee_sub_category_id ?? null,
        description: body.description,
        amount_due: body.amount,
        due_date: body.due_date ?? new Date(),
        is_manual_fine: body.is_manual_fine ?? false,
      },
    });

    res.status(201).json({ success: true, data: invoice });
  }),
);

// ── Reports ──────────────────────────────────────────────────────

feesRouter.get(
  "/reports/daily-collection",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ date: z.coerce.date() }).parse(req.query);
    const start = new Date(query.date.getFullYear(), query.date.getMonth(), query.date.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const payments = await prisma.payment.findMany({
      where: { paid_at: { gte: start, lt: end }, status: "COMPLETED" },
      include: { invoice: { include: { student: { select: { name_en: true, student_uid: true } } } } },
    });
    res.json({ success: true, data: { total: payments.reduce((sum, p) => sum + p.amount, 0), payments } });
  }),
);

feesRouter.get(
  "/reports/monthly-summary",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ month: z.coerce.number(), year: z.coerce.number() }).parse(req.query);
    const start = new Date(query.year, query.month - 1, 1);
    const end = new Date(query.year, query.month, 1);
    const payments = await prisma.payment.findMany({ where: { paid_at: { gte: start, lt: end }, status: "COMPLETED" } });

    const byCategory = new Map<string, number>();
    for (const p of payments) {
      const invoice = await prisma.invoice.findUnique({ where: { id: p.invoice_id } });
      if (invoice) byCategory.set(invoice.category, (byCategory.get(invoice.category) ?? 0) + p.amount);
    }

    res.json({
      success: true,
      data: { total: payments.reduce((sum, p) => sum + p.amount, 0), count: payments.length, by_category: Object.fromEntries(byCategory) },
    });
  }),
);

feesRouter.get(
  "/reports/dues",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional(), section_id: z.string().optional(), days_overdue: z.coerce.number().optional() }).parse(req.query);
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        ...((query.class_id || query.section_id) && {
          student: {
            ...(query.class_id && { current_class_id: query.class_id }),
            ...(query.section_id && { current_section_id: query.section_id }),
          },
        }),
      },
      include: { student: { select: { name_en: true, student_uid: true, father_phone: true } } },
    });

    const rules = await getFeeRules();
    const filtered = invoices
      .map((inv) => ({ ...inv, days_overdue_computed: Math.max(0, Math.floor((Date.now() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24)) - rules.grace_period_days) }))
      .filter((inv) => !query.days_overdue || inv.days_overdue_computed >= query.days_overdue);

    res.json({ success: true, data: filtered });
  }),
);

feesRouter.get(
  "/reports/defaulters",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional(), days_overdue: z.coerce.number().default(30) }).parse(req.query);
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, ...(query.class_id && { student: { current_class_id: query.class_id } }) },
      include: { student: { select: { id: true, name_en: true, student_uid: true, father_phone: true } } },
    });

    const cutoff = new Date(Date.now() - query.days_overdue * 24 * 60 * 60 * 1000);
    const overdue = invoices.filter((inv) => inv.due_date < cutoff);

    const byStudent = new Map<string, { student: unknown; total_due: number; invoice_count: number }>();
    for (const inv of overdue) {
      const key = inv.student_id;
      const entry = byStudent.get(key) ?? { student: inv.student, total_due: 0, invoice_count: 0 };
      entry.total_due += inv.amount_due + inv.fine_amount - inv.amount_paid;
      entry.invoice_count++;
      byStudent.set(key, entry);
    }

    res.json({ success: true, data: [...byStudent.values()] });
  }),
);

feesRouter.get(
  "/reports/export",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    const payments = await prisma.payment.findMany({
      where: { paid_at: { gte: query.from, lte: query.to }, status: "COMPLETED" },
      include: { invoice: { include: { student: { select: { name_en: true, student_uid: true } } } } },
      orderBy: { paid_at: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Fee Collection");
    sheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Student ID", key: "uid", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Category", key: "category", width: 15 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Gateway", key: "gateway", width: 12 },
    ];
    for (const p of payments) {
      sheet.addRow({
        date: p.paid_at?.toISOString().slice(0, 10),
        uid: p.invoice.student.student_uid,
        name: p.invoice.student.name_en,
        category: p.invoice.category,
        amount: p.amount,
        gateway: p.gateway,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Fee_Collection_${query.from.toISOString().slice(0, 10)}_${query.to.toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
);

feesRouter.get(
  "/reports/student-wise-due",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ student_id: z.string().min(1) }).parse(req.query);
    const invoices = await prisma.invoice.findMany({
      where: { student_id: query.student_id, status: { notIn: ["PAID", "WAIVED"] } },
      orderBy: { due_date: "asc" },
    });
    const total_due = invoices.reduce((sum, i) => sum + (i.amount_due + i.fine_amount - i.amount_paid), 0);
    res.json({ success: true, data: { total_due: Math.round(total_due * 100) / 100, invoices } });
  }),
);

// Class-wise Summary + Student-wise Summary (Plan Thirteen, Phase G) --
// both new aggregation queries, no existing precedent to reuse beyond the
// query shape already used in /reports/dues above.
feesRouter.get(
  "/reports/class-wise-summary",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().min(1) }).parse(req.query);
    const invoices = await prisma.invoice.findMany({
      where: { academic_year_id: query.academic_year_id },
      select: { amount_due: true, amount_paid: true, status: true, student: { select: { current_class_id: true, current_class: { select: { name_en: true } } } } },
    });

    const byClass = new Map<string, { class_name: string; generated: number; collected: number; due: number }>();
    for (const inv of invoices) {
      const classId = inv.student.current_class_id ?? "unassigned";
      const className = inv.student.current_class?.name_en ?? "Unassigned";
      const entry = byClass.get(classId) ?? { class_name: className, generated: 0, collected: 0, due: 0 };
      entry.generated += inv.amount_due;
      entry.collected += inv.amount_paid;
      if (inv.status !== "WAIVED") entry.due += Math.max(0, inv.amount_due - inv.amount_paid);
      byClass.set(classId, entry);
    }

    res.json({ success: true, data: [...byClass.entries()].map(([class_id, v]) => ({ class_id, ...v })) });
  }),
);

feesRouter.get(
  "/reports/student-wise-summary",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().min(1), class_id: z.string().optional() }).parse(req.query);
    const invoices = await prisma.invoice.findMany({
      where: { academic_year_id: query.academic_year_id, ...(query.class_id && { student: { current_class_id: query.class_id } }) },
      select: { amount_due: true, amount_paid: true, status: true, student_id: true, student: { select: { name_en: true, student_uid: true } } },
    });

    const byStudent = new Map<string, { name_en: string; student_uid: string; generated: number; collected: number; due: number }>();
    for (const inv of invoices) {
      const entry = byStudent.get(inv.student_id) ?? { name_en: inv.student.name_en, student_uid: inv.student.student_uid, generated: 0, collected: 0, due: 0 };
      entry.generated += inv.amount_due;
      entry.collected += inv.amount_paid;
      if (inv.status !== "WAIVED") entry.due += Math.max(0, inv.amount_due - inv.amount_paid);
      byStudent.set(inv.student_id, entry);
    }

    res.json({ success: true, data: [...byStudent.entries()].map(([student_id, v]) => ({ student_id, ...v })) });
  }),
);

feesRouter.get(
  "/reports/generation-log",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (_req, res) => {
    const runs = await prisma.invoiceGenerationRun.findMany({ orderBy: { run_at: "desc" }, take: 100 });
    res.json({ success: true, data: runs });
  }),
);

// Reads from Phase F's InvoiceWaiverApplication trail — hard-blocked on
// that phase landing first (it did).
feesRouter.get(
  "/reports/waivers",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ student_id: z.string().optional() }).parse(req.query);
    const applications = await prisma.invoiceWaiverApplication.findMany({
      where: query.student_id ? { invoice: { student_id: query.student_id } } : undefined,
      include: {
        invoice: { select: { id: true, invoice_no: true, description: true, category: true, student: { select: { name_en: true, student_uid: true } } } },
        student_waiver: { include: { waiver_type: { select: { name: true } } } },
      },
      orderBy: { applied_at: "desc" },
      take: 200,
    });
    res.json({ success: true, data: applications });
  }),
);
