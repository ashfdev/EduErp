import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { notFound, badRequest } from "../../lib/errors";
import { FEE_COLLECTION_ROLES } from "../../lib/roles";
import { logAudit } from "../../lib/audit-log";
import { runScheduledFeeReconciliation } from "../../jobs/fee-reconciliation.job";

// Plan Twenty-Four -- Fee Reconciliation & Assurance. Every route here is
// either a plain read of already-persisted findings, or a status update on
// one (review/dismiss/resolve) -- nothing here can create, edit, or delete
// an Invoice/FeeStructure/FeeStructureStudent row.
export const reconciliationRouter = Router();
reconciliationRouter.use(authenticate, authorize(FEE_COLLECTION_ROLES));

reconciliationRouter.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const [items, total] = await Promise.all([
      prisma.feeReconciliationRun.findMany({
        orderBy: { run_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.feeReconciliationRun.count(),
    ]);
    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

reconciliationRouter.get(
  "/runs/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z
      .object({
        type: z.enum(["COVERAGE_GAP", "UNEXPECTED_INVOICE", "ASSIGNMENT_GAP", "AMOUNT_VARIANCE"]).optional(),
        status: z.enum(["OPEN", "DISMISSED", "RESOLVED"]).optional(),
        class_id: z.string().optional(),
        section_id: z.string().optional(),
        group_id: z.string().optional(),
      })
      .parse(req.query);

    const run = await prisma.feeReconciliationRun.findUnique({ where: { id } });
    if (!run) throw notFound("Reconciliation run not found");

    const findings = await prisma.feeReconciliationFinding.findMany({
      where: {
        run_id: id,
        ...(query.type && { type: query.type }),
        ...(query.status && { status: query.status }),
        ...(query.class_id && { class_id: query.class_id }),
        ...(query.section_id && { section_id: query.section_id }),
        ...(query.group_id && { group_id: query.group_id }),
      },
      include: {
        student: { select: { name_en: true, student_uid: true } },
        fee_structure: { select: { name: true } },
        class: { select: { name_en: true } },
        section: { select: { name: true } },
        group: { select: { name_en: true } },
      },
      orderBy: { created_at: "asc" },
    });

    // Structure coverage summaries are per-run, not per-filter -- always the
    // full picture for this run regardless of the findings-table filters
    // above, so "which fee is assigned to which class" stays a stable
    // reference while the admin narrows the findings list around it.
    const structureSummaries = await prisma.feeStructureCoverageSummary.findMany({
      where: { run_id: id },
      orderBy: { expected_count: "desc" },
    });

    res.json({ success: true, data: { run, findings, structureSummaries } });
  }),
);

reconciliationRouter.post(
  "/run-now",
  asyncHandler(async (req, res) => {
    const result = await runScheduledFeeReconciliation(req.user!.sub, "MANUAL");
    if (!result.academicYearId) throw badRequest("No active academic year is configured — set one in Settings before running a reconciliation sweep");
    res.status(201).json({ success: true, data: result });
  }),
);

reconciliationRouter.put(
  "/findings/:id/review",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ status: z.enum(["DISMISSED", "RESOLVED"]), note: z.string().min(1, "A short note is required") }).parse(req.body);

    const finding = await prisma.feeReconciliationFinding.findUnique({ where: { id } });
    if (!finding) throw notFound("Finding not found");

    const updated = await prisma.feeReconciliationFinding.update({
      where: { id },
      data: { status: body.status, reviewed_by_id: req.user!.sub, reviewed_at: new Date(), review_note: body.note },
    });

    await logAudit("FEE_RECONCILIATION_FINDING_REVIEW", {
      userId: req.user!.sub,
      targetType: "FeeReconciliationFinding",
      targetId: id,
      metadata: { status: body.status, note: body.note, finding_type: finding.type },
      req,
    });

    res.json({ success: true, data: updated });
  }),
);
