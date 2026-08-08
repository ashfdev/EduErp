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
import { FEE_COLLECTION_ROLES, STAFF_ONLY_ROLES, WAIVER_REQUEST_REVIEW_ROLES } from "../../lib/roles";
import {
  feeStructureSchema, feeCategorySchema, feeSubCategorySchema, feeFineRuleSchema, assignFeeStructureClassesSchema, assignFeeStructureStudentsSchema,
  generateInvoiceSchema, generateBulkMonthlySchema, collectPaymentSchema, collectBatchSchema, adHocInvoiceSchema, adHocInvoiceBulkSchema,
  waiveInvoiceSchema, waiverTypeSchema, assignStudentWaiverSchema, assignStudentWaiverBulkSchema,
  approveWaiverRequestSchema, rejectWaiverRequestSchema,
} from "@education-erp/validators";
import { sendSms } from "../../services/sms.service";
import { createFeeReceiptJournal } from "../accounts/auto-journal.service";
import { generateInvoiceNo, generateReceiptNo } from "./fee-number.generator";
import { createMonthlyInvoiceIfMissing, syncOverdueInvoices, applyWaiversToInvoice, runMonthlyFeeGeneration, applyWaiverToExistingInvoices, formatFeePeriod } from "./invoice-helpers";
import { feeStructureAppliesToStudent, buildFeeStructureStudentWhere } from "./fee-structure-scope";
import { resolveFineForInvoice, describeFineSource } from "./fee-fine-engine";
import { logAudit } from "../../lib/audit-log";
import { createInAppNotification } from "../../services/in-app-notification.service";
import { ApiError, badRequest, conflict, notFound } from "../../lib/errors";
import { accountBalance } from "../accounts/accounts.routes";

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
        classes: { include: { class: { select: { id: true, name_en: true } }, group: { select: { id: true, name_en: true } } } },
        students: { include: { student: { select: { id: true, name_en: true, student_uid: true } } } },
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

// Full-replace multi-class (and, per entry, multi-group) assignment for a
// single FeeStructure (Plan Fourteen, Phase N3; group-level narrowing
// added later) -- when rows exist here they win over the legacy
// class_id/section_id scalar, which is enforced null at write time below.
// Soft-warning-with-override overlap check mirrors section-capacity.ts's
// exact pattern (an error.code the frontend recognizes + resubmit-with-
// override, never a silent allow or a hard dead-end). The overlap check
// itself stays class-level only, not group-aware -- assigning "Class 9
// Science" and "Class 9 Commerce" to two different active structures of
// the same category will still surface a warning (it only looks at
// class_id), but that's a deliberately cheap, safe-by-default trade-off:
// it can never silently create an ambiguous double-charge, it just may
// occasionally ask for one extra confirmation click the admin can
// knowingly override.
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
          class_id: { in: body.entries.map((e) => e.class_id) },
          fee_structure_id: { not: id },
          fee_structure: { is_active: true, category: structure.category, fee_sub_category_id: structure.fee_sub_category_id },
        },
        include: { class: { select: { name_en: true } } },
      });
      if (overlapping.length > 0) {
        const names = [...new Set(overlapping.map((o) => o.class.name_en))].join(", ");
        throw new ApiError(400, "FEE_STRUCTURE_CLASS_OVERLAP", `${names} already assigned to another active "${structure.category}" fee structure. If these are different Groups within the same class, this may be intentional. Continue anyway?`);
      }
    }

    const classes = await prisma.$transaction(async (tx) => {
      await tx.feeStructureClass.deleteMany({ where: { fee_structure_id: id } });
      await tx.feeStructureClass.createMany({ data: body.entries.map((e) => ({ fee_structure_id: id, class_id: e.class_id, group_id: e.group_id || null })) });
      await tx.feeStructure.update({ where: { id }, data: { class_id: null, section_id: null } });
      return tx.feeStructureClass.findMany({ where: { fee_structure_id: id }, include: { class: { select: { id: true, name_en: true } }, group: { select: { id: true, name_en: true } } } });
    });

    res.json({ success: true, data: classes });
  }),
);

// Full-replace individual-student assignment for a single FeeStructure --
// additive on top of whatever class/group scoping the structure also has
// (see fee-structure-scope.ts). No overlap check needed here: unlike
// class/group assignment (which two DIFFERENT structures of the same
// category shouldn't both cover), attaching a specific student to more
// than one fee structure at once is completely normal (they can owe
// Tuition, Library, and an individually-assigned elective fee all at the
// same time).
feesRouter.put(
  "/structures/:id/students",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = assignFeeStructureStudentsSchema.parse(req.body);
    const structure = await prisma.feeStructure.findUnique({ where: { id } });
    if (!structure) throw notFound("Fee structure not found");

    const students = await prisma.$transaction(async (tx) => {
      await tx.feeStructureStudent.deleteMany({ where: { fee_structure_id: id } });
      if (body.student_ids.length) {
        await tx.feeStructureStudent.createMany({ data: body.student_ids.map((student_id) => ({ fee_structure_id: id, student_id, assigned_by_id: req.user!.sub })) });
      }
      return tx.feeStructureStudent.findMany({ where: { fee_structure_id: id }, include: { student: { select: { id: true, name_en: true, student_uid: true } } } });
    });

    res.json({ success: true, data: students });
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

    // Group- and individual-student-aware (see fee-structure-scope.ts) --
    // when FeeStructureClass rows exist for this structure they win over
    // the legacy class_id scalar, narrowed further to a specific Group
    // where one is set; individually-assigned students (FeeStructureStudent)
    // are always included regardless of their own class/group.
    const scopeWhere = await buildFeeStructureStudentWhere(prisma, structure);
    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        ...(body.student_ids?.length ? { id: { in: body.student_ids } } : {}),
        ...scopeWhere,
      },
    });

    const now = new Date();
    const dueDate = body.due_date ?? new Date(body.year ?? now.getFullYear(), (body.month ?? now.getMonth() + 1) - 1, structure.due_day ?? 10);

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
    const { created, skipped } = await runMonthlyFeeGeneration(prisma, body.academic_year_id, body.month, body.year);

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
      include: {
        student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } } } },
        application: { select: { id: true, applicant_name: true, admission_roll: true } },
      },
      orderBy: { due_date: "desc" },
    });
    res.json({ success: true, data: invoices.map((inv) => ({ ...inv, period: formatFeePeriod(inv.month, inv.year) })) });
  }),
);

feesRouter.get(
  "/invoices/:id",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: true, student: true, application: { select: { id: true, applicant_name: true, admission_roll: true } } },
    });
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
        // A transferred/graduated/expelled student's old waiver was
        // showing here identically to a real, actionable active one --
        // this list is a management view (revoke, eventually edit), and
        // matches every other roster-facing query in this codebase in
        // never surfacing a non-active student by default.
        student: { deleted_at: null, status: "ACTIVE" },
        ...(query.student_id && { student_id: query.student_id }),
        ...(query.active_only === "true" && { revoked_at: null }),
        ...(query.class_id && { student: { current_class_id: query.class_id } }),
      },
      include: {
        student: {
          select: {
            id: true, name_en: true, student_uid: true,
            current_class: { select: { name_en: true } },
            current_section: { select: { name: true } },
            group: { select: { name_en: true } },
            father_phone: true,
          },
        },
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
    // Retroactive apply -- a waiver assigned today must also discount a
    // real invoice the student is already carrying (this month's tuition,
    // say), not only invoices generated from this point on. Without this,
    // "assign a waiver" looked like it silently did nothing whenever the
    // student already had an unpaid invoice at assignment time.
    const { invoicesAffected, totalDiscount } = await applyWaiverToExistingInvoices(prisma, { ...waiver, waiver_type: waiverType });
    await logAudit("FEE_WAIVE", { userId: req.user!.sub, targetType: "StudentWaiver", targetId: waiver.id, metadata: { student_id: body.student_id, waiver_type_id: body.waiver_type_id, invoicesAffected, totalDiscount }, req });
    res.status(201).json({ success: true, data: { ...waiver, invoices_affected: invoicesAffected, total_discount: totalDiscount } });
  }),
);

// Bulk assign -- same create logic as the single-student route above, one
// row per selected student, never erroring out the whole batch over a
// single bad id (a roster picker can't guarantee every id is still valid
// by submit time) -- skipped ids are reported back, not silently dropped.
feesRouter.post(
  "/student-waivers/bulk",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = assignStudentWaiverBulkSchema.parse(req.body);
    const waiverType = await prisma.waiverType.findUnique({ where: { id: body.waiver_type_id } });
    if (!waiverType) throw notFound("Waiver type not found");

    const students = await prisma.student.findMany({ where: { id: { in: body.student_ids }, deleted_at: null }, select: { id: true } });
    const validIds = new Set(students.map((s) => s.id));
    const skipped = body.student_ids.filter((id) => !validIds.has(id));

    // Callback-style transaction (not the array-of-promises form used
    // before) since each student now needs a create followed by a
    // retroactive-apply step, not just an independent create.
    const { created, invoicesAffected, totalDiscount } = await prisma.$transaction(async (tx) => {
      const created: { id: string }[] = [];
      let invoicesAffected = 0;
      let totalDiscount = 0;
      for (const studentId of validIds) {
        const waiver = await tx.studentWaiver.create({
          data: { student_id: studentId, waiver_type_id: body.waiver_type_id, academic_year_id: body.academic_year_id ?? null, assigned_by_id: req.user!.sub },
        });
        created.push(waiver);
        const result = await applyWaiverToExistingInvoices(tx, { ...waiver, waiver_type: waiverType });
        invoicesAffected += result.invoicesAffected;
        totalDiscount += result.totalDiscount;
      }
      return { created, invoicesAffected, totalDiscount: Math.round(totalDiscount * 100) / 100 };
    });

    await logAudit("FEE_WAIVE", {
      userId: req.user!.sub,
      targetType: "StudentWaiver",
      targetId: "bulk",
      metadata: { waiver_type_id: body.waiver_type_id, student_count: created.length, skipped, invoicesAffected, totalDiscount },
      req,
    });

    res.status(201).json({ success: true, data: { created: created.length, skipped, invoices_affected: invoicesAffected, total_discount: totalDiscount } });
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

    // Real gap found in audit (2026-08-08): revoking a waiver only ever
    // flipped this row's own revoked_at -- it never reversed the discount
    // already applied to any invoice this waiver had previously reduced
    // (applyWaiverToExistingInvoices/applyWaiversToInvoice), so a "revoked"
    // waiver kept silently discounting a student's still-owed invoices
    // forever. Reasoned default (deliberate, not silently decided): only
    // reverse invoices still in PENDING/PARTIAL/OVERDUE -- the exact same
    // status set applyWaiverToExistingInvoices itself only ever discounts
    // in the first place -- so a PAID invoice (money already collected
    // under the old discount) is never retroactively re-billed. The
    // InvoiceWaiverApplication row is deleted on reversal (not kept
    // stale/misleading) since revoking removes the waiver's effect
    // entirely; the revoke action itself is what's permanently recorded,
    // via the audit log below.
    const { waiver, invoicesAffected, totalReversed } = await prisma.$transaction(async (tx) => {
      const applications = await tx.invoiceWaiverApplication.findMany({
        where: { student_waiver_id: id, invoice: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } },
        include: { invoice: true },
      });

      let invoicesAffected = 0;
      let totalReversed = 0;
      for (const app of applications) {
        await tx.invoice.update({ where: { id: app.invoice_id }, data: { amount_due: app.invoice.amount_due + app.discount_amount } });
        await tx.invoiceWaiverApplication.delete({ where: { id: app.id } });
        invoicesAffected++;
        totalReversed += app.discount_amount;
      }

      const waiver = await tx.studentWaiver.update({ where: { id }, data: { revoked_at: new Date(), revoked_by_id: req.user!.sub } });
      return { waiver, invoicesAffected, totalReversed: Math.round(totalReversed * 100) / 100 };
    });

    await logAudit("FEE_WAIVE", {
      userId: req.user!.sub,
      targetType: "StudentWaiver",
      targetId: waiver.id,
      metadata: { via: "revoke", invoicesAffected, totalReversed },
      req,
    });
    res.json({ success: true, data: { ...waiver, invoices_affected: invoicesAffected, total_reversed: totalReversed } });
  }),
);

// ── Waiver Requests (student-initiated, admin-reviewed) ────────────
// Broad read (STAFF_ONLY_ROLES) so any staff role viewing a student's
// profile can see request status; review/decide is narrower
// (WAIVER_REQUEST_REVIEW_ROLES), same split as every other read/write pair
// on this router.

feesRouter.get(
  "/waiver-requests",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(), student_id: z.string().optional() }).parse(req.query);
    const requests = await prisma.waiverRequest.findMany({
      where: { ...(query.status && { status: query.status }), ...(query.student_id && { student_id: query.student_id }) },
      include: {
        student: {
          select: {
            id: true, name_en: true, student_uid: true,
            current_class: { select: { name_en: true } },
            current_section: { select: { name: true } },
          },
        },
        student_waiver: { include: { waiver_type: true } },
      },
      orderBy: { created_at: "asc" },
    });

    // Context the reviewer needs to decide, computed here rather than left
    // for the admin to look up separately (same discipline as the
    // DocumentRequest review queue).
    const data = await Promise.all(
      requests.map(async (r) => {
        const [invoices, activeWaiverCount] = await Promise.all([
          prisma.invoice.findMany({ where: { student_id: r.student_id }, select: { amount_due: true, fine_amount: true, amount_paid: true } }),
          prisma.studentWaiver.count({ where: { student_id: r.student_id, revoked_at: null } }),
        ]);
        const outstanding_due = invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
        return { ...r, context: { outstanding_due, active_waiver_count: activeWaiverCount } };
      }),
    );
    res.json({ success: true, data });
  }),
);

feesRouter.put(
  "/waiver-requests/:id/approve",
  authorize(WAIVER_REQUEST_REVIEW_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = approveWaiverRequestSchema.parse(req.body);
    const request = await prisma.waiverRequest.findFirst({ where: { id, status: "PENDING" } });
    if (!request) throw notFound("Request not found or already reviewed");

    const waiverType = await prisma.waiverType.findUnique({ where: { id: body.waiver_type_id } });
    if (!waiverType) throw notFound("Waiver type not found");

    // Approving IS granting -- one transaction creates the real
    // StudentWaiver (retroactively applied to already-issued invoices,
    // same as the direct assign flow) and resolves the request together,
    // so a request can never read "Approved" with no waiver behind it.
    const { updated, invoicesAffected, totalDiscount } = await prisma.$transaction(async (tx) => {
      const waiver = await tx.studentWaiver.create({
        data: { student_id: request.student_id, waiver_type_id: body.waiver_type_id, academic_year_id: body.academic_year_id ?? null, assigned_by_id: req.user!.sub },
      });
      const { invoicesAffected, totalDiscount } = await applyWaiverToExistingInvoices(tx, { ...waiver, waiver_type: waiverType });
      const updated = await tx.waiverRequest.update({
        where: { id },
        data: { status: "APPROVED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), student_waiver_id: waiver.id },
      });
      return { updated, invoicesAffected, totalDiscount };
    });

    await logAudit("FEE_WAIVE", { userId: req.user!.sub, targetType: "StudentWaiver", targetId: updated.student_waiver_id!, metadata: { student_id: request.student_id, waiver_type_id: body.waiver_type_id, via: "waiver_request", invoicesAffected, totalDiscount }, req });
    await logAudit("WAIVER_REQUEST_REVIEWED", { userId: req.user!.sub, targetType: "WaiverRequest", targetId: id, metadata: { decision: "APPROVED", waiver_type_id: body.waiver_type_id }, req });
    await createInAppNotification({
      userId: request.requested_by_user_id,
      type: "WAIVER_APPROVED",
      title: "Waiver request approved",
      body: `Your request for financial assistance has been approved — ${waiverType.name} applied.`,
      link: "/fees/waivers",
    });
    res.json({ success: true, data: { ...updated, invoices_affected: invoicesAffected, total_discount: totalDiscount } });
  }),
);

feesRouter.put(
  "/waiver-requests/:id/reject",
  authorize(WAIVER_REQUEST_REVIEW_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectWaiverRequestSchema.parse(req.body);
    const request = await prisma.waiverRequest.findFirst({ where: { id, status: "PENDING" } });
    if (!request) throw notFound("Request not found or already reviewed");

    const updated = await prisma.waiverRequest.update({
      where: { id },
      data: { status: "REJECTED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), rejection_reason: body.rejection_reason },
    });
    await logAudit("WAIVER_REQUEST_REVIEWED", { userId: req.user!.sub, targetType: "WaiverRequest", targetId: id, metadata: { decision: "REJECTED" }, req });
    await createInAppNotification({
      userId: request.requested_by_user_id,
      type: "WAIVER_REJECTED",
      title: "Waiver request rejected",
      body: body.rejection_reason,
      link: "/fees/waivers",
    });
    res.json({ success: true, data: updated });
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

    // Everything that reads-then-writes Invoice.amount_paid runs inside one
    // transaction, with a row lock acquired FIRST -- two concurrent
    // payments against the SAME invoice (a counter payment racing a
    // gateway webhook, or two staff double-submitting) used to both read
    // the same stale amount_paid and silently lose one payment's
    // contribution (a classic lost-update race under Postgres's default
    // READ COMMITTED isolation, which a bare $transaction without an
    // explicit lock does NOT prevent). FOR UPDATE serializes any concurrent
    // transaction touching this same invoice behind this one.
    const { payment, updated, appliedToInvoice, overflow, student, application, applicationGuardianPhone } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${body.invoice_id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id: body.invoice_id } });
      if (!invoice) throw notFound("Invoice not found");
      if (invoice.status === "PAID") throw badRequest("Invoice is already fully paid");

      // invoice.student_id is null for a pre-enrollment, application-linked
      // invoice (Plan Twenty-Three, Phase 3) -- resolve whichever side is
      // real and use it for the recipient name/phone below instead of
      // dereferencing student unconditionally.
      const student = invoice.student_id ? await tx.student.findUnique({ where: { id: invoice.student_id } }) : null;
      const application = invoice.application_id ? await tx.admissionApplication.findUnique({ where: { id: invoice.application_id } }) : null;
      const applicationGuardianPhone = (application?.guardian_info as { phone?: string } | null)?.phone;
      const rules = await getFeeRules();
      // Class/sub-category-scoped fine engine (Phase N2) -- falls back to the
      // unmodified calculateLateFee() when no FeeFineRule matches, so a
      // category/class that never opts in sees byte-identical behavior.
      const fine = await resolveFineForInvoice(tx, invoice, student?.current_class_id ?? null, rules);

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

      const payment = await tx.payment.create({
        data: {
          receipt_no: await generateReceiptNo(tx),
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

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { amount_paid: newAmountPaid, fine_amount: fine, status: newStatus },
      });

      // Advance-credit overflow only has somewhere to land once a real
      // Student exists -- an application has no credit_balance concept
      // (in practice this path isn't reachable pre-enrollment anyway, since
      // an applicant only ever owes a fixed app_fee/form_fee amount).
      if (overflow > 0 && invoice.student_id) {
        await tx.student.update({ where: { id: invoice.student_id }, data: { credit_balance: { increment: overflow } } });
      }

      return { payment, updated, appliedToInvoice, overflow, student, application, applicationGuardianPhone };
    });

    await createFeeReceiptJournal(payment, updated, appliedToInvoice);

    const recipientName = student?.name_en ?? application?.applicant_name;
    const recipientPhone = student?.father_phone ?? applicationGuardianPhone;
    if (recipientPhone) {
      await sendSms(
        recipientPhone,
        overflow > 0
          ? `Payment of ৳${payment.amount} received for ${recipientName}. ৳${overflow} credited as advance balance. Thank you.`
          : `Payment of ৳${payment.amount} received for ${recipientName}. Thank you.`,
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
        const period = formatFeePeriod(inv.month, inv.year);
        return {
          invoice_id: inv.id,
          category: inv.category,
          sub_category: inv.fee_sub_category?.name ?? null,
          description: inv.description,
          period,
          due_date: inv.due_date.toISOString(),
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          fine_amount: fine,
          fine_source: fineSource,
          outstanding,
          is_manual_fine: inv.is_manual_fine,
          waivers: inv.waiver_applications.map((w) => ({ id: w.id, waiver_name: w.student_waiver.waiver_type.name, discount_amount: w.discount_amount })),
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
    // current_class_id is deliberately preserved after a student leaves (for
    // history), so it alone can't gate this — a graduated/transferred/
    // expelled student must never be billed again on-demand.
    if (student.status !== "ACTIVE") throw badRequest(`This student is ${student.status.toLowerCase()}, not active — cannot generate fees`);
    if (!student.current_class_id) throw badRequest("This student has no current class assigned");

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    if (!activeYear) throw badRequest("No active academic year configured");

    const structures = await prisma.feeStructure.findMany({ where: { academic_year_id: activeYear.id, is_active: true, frequency: "MONTHLY" } });
    const now = new Date();
    let created = 0;
    let skipped = 0;
    for (const structure of structures) {
      if (!(await feeStructureAppliesToStudent(prisma, structure, student.current_class_id, student.current_section_id, student.id, student.group_id))) continue;
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
        // Same lost-update race as /collect above -- this loop already runs
        // inside a $transaction, but under Postgres's default READ
        // COMMITTED isolation that alone does not block a concurrent
        // transaction from reading the same pre-write amount_paid. The
        // explicit row lock is what actually closes it.
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${line.invoice_id} FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({ where: { id: line.invoice_id } });
        if (!invoice) throw notFound(`Invoice ${line.invoice_id} not found`);
        if (invoice.status === "PAID") throw badRequest(`"${invoice.description}" is already fully paid`);
        studentId = invoice.student_id;

        // invoice.student_id is null for a pre-enrollment, application-
        // linked invoice (Plan Twenty-Three, Phase 3) -- this batch-collect
        // workspace is realistically only ever used against a real
        // student's existing invoices, but stays null-safe regardless.
        const invStudent = invoice.student_id ? await tx.student.findUnique({ where: { id: invoice.student_id }, select: { current_class_id: true } }) : null;
        const fine = await resolveFineForInvoice(tx, invoice, invStudent?.current_class_id ?? null, rules);

        // Waiver override (Plan Fifteen, Phase E) — "collect the full amount
        // for this one payment, ignoring the standing waiver just this
        // once." Re-derived server-side from the caller-supplied ids (never
        // trust a client-supplied amount), scoped defensively to THIS
        // invoice so an id copy-pasted from a different invoice can't leak
        // its discount in here. Adds the overridden discount(s) back onto
        // the already-waiver-netted amount_due for this transaction only —
        // this UI always collects a selected line's FULL outstanding in one
        // shot (no partial-amount input exists), so the invoice necessarily
        // reaches PAID for this line whenever an override is used, meaning
        // persisting the un-waived amount_due below is always correct, never
        // a partial-state corruption. The StudentWaiver/InvoiceWaiverApplication
        // rows themselves are never touched — fully active again the moment
        // a future invoice is generated for this student.
        let overriddenWaiverAmount = 0;
        let overriddenWaiverNames: string[] = [];
        if (line.override_waiver_application_ids?.length) {
          const overridden = await tx.invoiceWaiverApplication.findMany({
            where: { id: { in: line.override_waiver_application_ids }, invoice_id: invoice.id },
            include: { student_waiver: { include: { waiver_type: { select: { name: true } } } } },
          });
          overriddenWaiverAmount = overridden.reduce((s, w) => s + w.discount_amount, 0);
          overriddenWaiverNames = overridden.map((w) => `${w.student_waiver.waiver_type.name} (৳${w.discount_amount})`);
        }

        const discount = Math.min(line.discount_amount ?? 0, invoice.amount_due + overriddenWaiverAmount);
        const effectiveAmountDue = Math.max(0, invoice.amount_due + overriddenWaiverAmount - discount);
        const outstanding = Math.max(0, effectiveAmountDue + fine - invoice.amount_paid);
        if (line.amount > outstanding && !rules.advance_payment_allowed) {
          throw badRequest(`Amount for "${invoice.description}" exceeds the outstanding balance (৳${outstanding}).`);
        }
        const appliedToInvoice = Math.min(line.amount, outstanding);
        const overflow = line.amount - appliedToInvoice;

        const overrideNote = overriddenWaiverNames.length ? `Waiver override — collected in full: ${overriddenWaiverNames.join(", ")}.` : null;
        const payment = await tx.payment.create({
          data: {
            receipt_no: await generateReceiptNo(tx),
            invoice_id: invoice.id,
            gateway: body.gateway,
            amount: line.amount,
            status: "COMPLETED",
            paid_at: new Date(),
            notes: [body.notes, overrideNote].filter(Boolean).join(" ") || undefined,
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

        if (overflow > 0 && invoice.student_id) {
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

// Bulk variant -- one ad-hoc invoice per selected student, same fields
// applied identically to every row (e.g. "fine every student in this
// section ৳100 for the same reason"). Skipped/invalid ids are reported
// back rather than failing the whole batch.
feesRouter.post(
  "/invoices/ad-hoc/bulk",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = adHocInvoiceBulkSchema.parse(req.body);
    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    if (!activeYear) throw badRequest("No active academic year configured");

    const students = await prisma.student.findMany({ where: { id: { in: body.student_ids }, deleted_at: null }, select: { id: true } });
    const validIds = students.map((s) => s.id);
    const skipped = body.student_ids.filter((id) => !validIds.includes(id));

    const invoices = [];
    for (const studentId of validIds) {
      invoices.push(
        await prisma.invoice.create({
          data: {
            invoice_no: await generateInvoiceNo(prisma),
            student_id: studentId,
            academic_year_id: activeYear.id,
            category: body.category,
            fee_sub_category_id: body.fee_sub_category_id ?? null,
            description: body.description,
            amount_due: body.amount,
            due_date: body.due_date ?? new Date(),
            is_manual_fine: body.is_manual_fine ?? false,
          },
        }),
      );
    }

    res.status(201).json({ success: true, data: { created: invoices.length, skipped } });
  }),
);

// ── Collection Dashboard (the landing page an accountant sees when they
// click "Collect Fee") ──────────────────────────────────────────────
//
// One shared filter set drives everything on this page: the summary KPIs,
// the per-fee-structure breakdown, and the drill-down student/invoice
// list all resolve from the exact same `where` clause + date range below,
// via the same collectionDashboardQuery schema and resolveDashboardScope
// helper -- so the numbers on the KPI cards can never silently disagree
// with what the drill-down actually shows for the same filters (the
// single biggest correctness risk for a "the top cards must recompute
// per filter, not stay fixed" dashboard like this one).

const collectionDashboardQuery = z.object({
  academic_year_id: z.string().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
  class_id: z.string().optional(),
  section_id: z.string().optional(),
  group_id: z.string().optional(),
  category: z.string().optional(),
  fee_sub_category_id: z.string().optional(),
  frequency: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).optional(),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "WAIVED"]).optional(),
});
type CollectionDashboardQuery = z.infer<typeof collectionDashboardQuery>;

async function resolveDashboardScope(query: CollectionDashboardQuery) {
  const academicYear = query.academic_year_id
    ? await prisma.academicYear.findUnique({ where: { id: query.academic_year_id } })
    : await prisma.academicYear.findFirst({ where: { is_active: true } });

  // The date range used for the Financial Context strip (revenue/expense/
  // salary paid) -- month-bounded when a month is picked, otherwise the
  // whole academic year. Kept separate from the Invoice `where` below
  // (which uses month/year as an OR against due_date, not a hard filter)
  // since "what period is this money-in/money-out for" and "which
  // invoices count toward this fee report" are related but not identical
  // questions.
  let periodStart: Date;
  let periodEnd: Date;
  let periodLabel: string;
  if (query.month && query.year) {
    periodStart = new Date(query.year, query.month - 1, 1);
    periodEnd = new Date(query.year, query.month, 1);
    periodLabel = `${MONTH_NAMES_DASHBOARD[query.month - 1]} ${query.year}`;
  } else if (academicYear) {
    periodStart = academicYear.start_date;
    periodEnd = new Date(academicYear.end_date.getTime() + 24 * 60 * 60 * 1000);
    periodLabel = academicYear.label;
  } else {
    periodStart = new Date(0);
    periodEnd = new Date(8640000000000000);
    periodLabel = "All Time";
  }

  const where: Record<string, unknown> = {
    // A pre-enrollment application-linked due (Plan Twenty-Three) belongs
    // to the Admission module's own payment tracking, not this
    // per-enrolled-student collection dashboard -- same exclusion already
    // established by /reports/dues and /reports/defaulters.
    student_id: { not: null },
    ...(academicYear && { academic_year_id: academicYear.id }),
    ...(query.category && { category: query.category }),
    ...(query.fee_sub_category_id && { fee_sub_category_id: query.fee_sub_category_id }),
    ...(query.status && { status: query.status }),
    ...(query.frequency && {
      // Ad-hoc invoices (fee_structure_id: null) have no real "frequency"
      // of their own, but behave like a one-time charge in spirit -- fold
      // them into the ONE_TIME bucket rather than making them invisible
      // to every frequency filter.
      ...(query.frequency === "ONE_TIME"
        ? { OR: [{ fee_structure: { frequency: "ONE_TIME" } }, { fee_structure_id: null }] }
        : { fee_structure: { frequency: query.frequency } }),
    }),
    ...((query.class_id || query.section_id || query.group_id) && {
      student: {
        ...(query.class_id && { current_class_id: query.class_id }),
        ...(query.section_id && { current_section_id: query.section_id }),
        ...(query.group_id && { group_id: query.group_id }),
      },
    }),
    ...(query.month && query.year && {
      // Captures both real MONTHLY invoices for that exact month (via
      // their own stored month/year) AND any ONE_TIME/YEARLY invoice that
      // happens to be due within that calendar month -- "what's relevant
      // to collect this month," not just "what recurring fee is this."
      OR: [
        { month: query.month, year: query.year },
        { due_date: { gte: periodStart, lt: periodEnd } },
      ],
    }),
  };

  return { academicYear, periodStart, periodEnd, periodLabel, where };
}

const MONTH_NAMES_DASHBOARD = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Mirrors accounts/reports.routes.ts's own income/expenditure section-total
// pattern (debit-minus-credit over EXPENSE accounts, credit-minus-debit
// over INCOME accounts, POSTED vouchers only, date-ranged) rather than
// re-deriving different arithmetic -- kept local since that file doesn't
// export it, but the shape is identical on purpose so the two screens
// never quietly disagree about what "total revenue" means for the same
// range.
async function ledgerSectionTotal(accountType: "INCOME" | "EXPENSE", from: Date, to: Date): Promise<number> {
  const accounts = await prisma.account.findMany({ where: { account_group: { type: accountType }, is_active: true }, select: { id: true } });
  if (!accounts.length) return 0;
  const accountIds = accounts.map((a) => a.id);
  const [debitAgg, creditAgg] = await Promise.all([
    prisma.journalEntry.aggregate({ where: { debit_account_id: { in: accountIds }, voucher: { status: "POSTED", date: { gte: from, lt: to } } }, _sum: { amount: true } }),
    prisma.journalEntry.aggregate({ where: { credit_account_id: { in: accountIds }, voucher: { status: "POSTED", date: { gte: from, lt: to } } }, _sum: { amount: true } }),
  ]);
  const debit = debitAgg._sum.amount ?? 0;
  const credit = creditAgg._sum.amount ?? 0;
  return accountType === "INCOME" ? credit - debit : debit - credit;
}

feesRouter.get(
  "/collection-dashboard",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = collectionDashboardQuery.parse(req.query);
    // Keep OVERDUE fresh on every dashboard load -- an invoice that fell
    // past its grace-period deadline since the last write-triggered sync
    // must not show as a stale PENDING here, since this page's whole point
    // is being an accurate, up-to-the-moment picture.
    await syncOverdueInvoices(prisma);
    const { academicYear, periodStart, periodEnd, periodLabel, where } = await resolveDashboardScope(query);

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        student_id: true, fee_structure_id: true, category: true, amount_due: true, amount_paid: true, fine_amount: true, status: true, due_date: true,
        fee_structure: { select: { id: true, name: true, category: true, frequency: true, fee_sub_category: { select: { name: true } } } },
      },
    });

    const now = new Date();
    let totalInvoiced = 0;
    let totalCollected = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    const studentTotals = new Map<string, { due: number; hasAny: boolean }>();
    const byStructure = new Map<string, { fee_structure_id: string | null; name: string; category: string; sub_category: string | null; frequency: string | null; invoice_count: number; total_invoiced: number; total_collected: number }>();

    for (const inv of invoices) {
      const invoiced = inv.amount_due + inv.fine_amount;
      const outstanding = Math.max(0, invoiced - inv.amount_paid);
      totalInvoiced += invoiced;
      totalCollected += inv.amount_paid;
      if (inv.status === "OVERDUE" || (inv.due_date < now && outstanding > 0 && inv.status !== "PAID" && inv.status !== "WAIVED")) {
        overdueCount++;
        overdueAmount += outstanding;
      }

      const sKey = inv.student_id!;
      const sEntry = studentTotals.get(sKey) ?? { due: 0, hasAny: false };
      sEntry.due += outstanding;
      sEntry.hasAny = true;
      studentTotals.set(sKey, sEntry);

      const structKey = inv.fee_structure_id ?? `adhoc:${inv.category}`;
      const structEntry = byStructure.get(structKey) ?? {
        fee_structure_id: inv.fee_structure_id,
        name: inv.fee_structure?.name ?? `${inv.category} (ad-hoc)`,
        category: inv.fee_structure?.category ?? inv.category,
        sub_category: inv.fee_structure?.fee_sub_category?.name ?? null,
        frequency: inv.fee_structure?.frequency ?? null,
        invoice_count: 0,
        total_invoiced: 0,
        total_collected: 0,
      };
      structEntry.invoice_count++;
      structEntry.total_invoiced += invoiced;
      structEntry.total_collected += inv.amount_paid;
      byStructure.set(structKey, structEntry);
    }

    const totalOutstanding = Math.round((totalInvoiced - totalCollected) * 100) / 100;
    let fullyPaidCount = 0;
    let withDuesCount = 0;
    for (const s of studentTotals.values()) {
      if (s.due <= 0) fullyPaidCount++;
      else withDuesCount++;
    }

    const [salaryPaidAgg, cashAccount, bankAccount, totalRevenue, totalExpense] = await Promise.all([
      prisma.payrollRecord.aggregate({ where: { status: "PAID", paid_at: { gte: periodStart, lt: periodEnd } }, _sum: { net_salary: true } }),
      prisma.account.findUnique({ where: { code: "1001" } }),
      prisma.account.findUnique({ where: { code: "1002" } }),
      ledgerSectionTotal("INCOME", periodStart, periodEnd),
      ledgerSectionTotal("EXPENSE", periodStart, periodEnd),
    ]);
    const [cashBalance, bankBalance] = await Promise.all([
      cashAccount ? accountBalance(cashAccount.id) : Promise.resolve({ balance: 0 }),
      bankAccount ? accountBalance(bankAccount.id) : Promise.resolve({ balance: 0 }),
    ]);

    res.json({
      success: true,
      data: {
        academic_year: academicYear ? { id: academicYear.id, label: academicYear.label } : null,
        period_label: periodLabel,
        // Exposed so the frontend can pull the per-account expense/income
        // breakdown from GET /api/accounts/reports/income-expenditure for
        // this EXACT same range, rather than re-deriving an equivalent
        // date pair client-side and risking subtle drift from what this
        // route actually computed.
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        summary: {
          total_students: studentTotals.size,
          total_invoiced: Math.round(totalInvoiced * 100) / 100,
          total_collected: Math.round(totalCollected * 100) / 100,
          total_outstanding: totalOutstanding,
          collection_percentage: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0,
          overdue_count: overdueCount,
          overdue_amount: Math.round(overdueAmount * 100) / 100,
          fully_paid_count: fullyPaidCount,
          with_dues_count: withDuesCount,
        },
        by_structure: [...byStructure.values()]
          .map((s) => ({
            ...s,
            total_invoiced: Math.round(s.total_invoiced * 100) / 100,
            total_collected: Math.round(s.total_collected * 100) / 100,
            total_outstanding: Math.round((s.total_invoiced - s.total_collected) * 100) / 100,
            collection_percentage: s.total_invoiced > 0 ? Math.round((s.total_collected / s.total_invoiced) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.total_outstanding - a.total_outstanding),
        financial_context: {
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_expense: Math.round(totalExpense * 100) / 100,
          net_position: Math.round((totalRevenue - totalExpense) * 100) / 100,
          salary_paid: Math.round((salaryPaidAgg._sum.net_salary ?? 0) * 100) / 100,
          current_fund_balance: Math.round((cashBalance.balance + bankBalance.balance) * 100) / 100,
        },
      },
    });
  }),
);

// Drill-down list -- "who owes, who's paid" for the exact same filter set
// (plus an optional fee_structure_id to scope to one row's "View" click
// from the breakdown table above), so a number on the dashboard and the
// list you get by clicking it are always describing the same thing.
feesRouter.get(
  "/collection-dashboard/invoices",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = collectionDashboardQuery.extend({
      fee_structure_id: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const { where } = await resolveDashboardScope(query);

    const fullWhere = {
      ...where,
      ...(query.fee_structure_id && { fee_structure_id: query.fee_structure_id }),
      ...(query.search && {
        student: {
          ...(where as { student?: Record<string, unknown> }).student,
          OR: [
            { name_en: { contains: query.search, mode: "insensitive" as const } },
            { student_uid: { contains: query.search, mode: "insensitive" as const } },
          ],
        },
      }),
    };

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where: fullWhere }),
      prisma.invoice.findMany({
        where: fullWhere,
        include: {
          student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } },
        },
        orderBy: { due_date: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    res.json({
      success: true,
      data: invoices.map((inv) => ({
        id: inv.id,
        student: inv.student ? { id: inv.student.id, name_en: inv.student.name_en, student_uid: inv.student.student_uid, class_name: inv.student.current_class?.name_en ?? null, section_name: inv.student.current_section?.name ?? null } : null,
        description: inv.description,
        category: inv.category,
        amount_due: inv.amount_due,
        amount_paid: inv.amount_paid,
        fine_amount: inv.fine_amount,
        // Floored at 0 for display -- a genuine overpayment isn't "negative
        // debt," it's an advance credit (already tracked separately via
        // Student.credit_balance and shown in the Collect dialog); showing
        // a raw negative number here would read as a confusing error to an
        // accountant, not as useful information.
        outstanding: Math.max(0, Math.round((inv.amount_due + inv.fine_amount - inv.amount_paid) * 100) / 100),
        status: inv.status,
        due_date: inv.due_date,
      })),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    });
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
      include: {
        invoice: {
          include: {
            student: { select: { name_en: true, student_uid: true } },
            application: { select: { id: true, applicant_name: true, admission_roll: true } },
          },
        },
      },
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
        // Inherently a per-enrolled-student report (class/section filters
        // only make sense for someone already placed in one) -- a
        // pre-enrollment application-linked due belongs to the Admission
        // module's own payment tracking instead, matching how
        // /reports/defaulters already excludes it for the same reason.
        student_id: { not: null },
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
    // A pre-enrollment application-linked due (Plan Twenty-Three, Phase 3)
    // isn't a "defaulter" in this report's sense -- that's tracked via the
    // admission module's own payment_status, not this enrolled-student view.
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, student_id: { not: null }, ...(query.class_id && { student: { current_class_id: query.class_id } }) },
      include: { student: { select: { id: true, name_en: true, student_uid: true, father_phone: true } } },
    });

    const cutoff = new Date(Date.now() - query.days_overdue * 24 * 60 * 60 * 1000);
    const overdue = invoices.filter((inv) => inv.due_date < cutoff);

    const byStudent = new Map<string, { student: unknown; total_due: number; invoice_count: number }>();
    for (const inv of overdue) {
      if (!inv.student_id) continue;
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
    // Scoped to real (post-enrollment) student fee collections -- a
    // pre-enrollment application-linked payment (Plan Twenty-Three, Phase
    // 3) has no Student ID/class to report here; it isn't excluded from the
    // real accounts ledger, just from this specific per-student export.
    const payments = await prisma.payment.findMany({
      where: { paid_at: { gte: query.from, lte: query.to }, status: "COMPLETED", invoice: { student_id: { not: null } } },
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
        uid: p.invoice.student?.student_uid ?? "-",
        name: p.invoice.student?.name_en ?? "-",
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
    // Application-linked (student: null) invoices bucket under "Unassigned"
    // alongside real students with no current_class_id, rather than being
    // silently dropped from the summary (Plan Twenty-Three, Phase 3).
    const invoices = await prisma.invoice.findMany({
      where: { academic_year_id: query.academic_year_id },
      select: { amount_due: true, amount_paid: true, status: true, student: { select: { current_class_id: true, current_class: { select: { name_en: true } } } } },
    });

    const byClass = new Map<string, { class_name: string; generated: number; collected: number; due: number }>();
    for (const inv of invoices) {
      const classId = inv.student?.current_class_id ?? "unassigned";
      const className = inv.student?.current_class?.name_en ?? "Unassigned";
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
    // Inherently a per-Student report -- a pre-enrollment application-linked
    // invoice has no student_id to key by, so it's excluded here rather
    // than needing a synthetic "student" shape (Plan Twenty-Three, Phase 3).
    const invoices = await prisma.invoice.findMany({
      where: { academic_year_id: query.academic_year_id, student_id: { not: null }, ...(query.class_id && { student: { current_class_id: query.class_id } }) },
      select: { amount_due: true, amount_paid: true, status: true, student_id: true, student: { select: { name_en: true, student_uid: true } } },
    });

    const byStudent = new Map<string, { name_en: string; student_uid: string; generated: number; collected: number; due: number }>();
    for (const inv of invoices) {
      if (!inv.student_id || !inv.student) continue;
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
        invoice: {
          select: {
            id: true, invoice_no: true, description: true, category: true,
            student: { select: { name_en: true, student_uid: true } },
            // Defensive, not currently reachable in practice: a waiver only
            // ever applies once a StudentWaiver exists, which requires a
            // real Student -- meaning by the time a waiver is applied, the
            // invoice's own student_id is already claimed. Included anyway
            // so this route can't silently break if that ordering ever
            // changes, matching the same pattern applied everywhere else
            // an Invoice is read.
            application: { select: { id: true, applicant_name: true, admission_roll: true } },
          },
        },
        student_waiver: { include: { waiver_type: { select: { name: true } } } },
      },
      orderBy: { applied_at: "desc" },
      take: 200,
    });
    res.json({ success: true, data: applications });
  }),
);
