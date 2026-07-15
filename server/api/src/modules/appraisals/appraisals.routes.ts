import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { APPRAISAL_MANAGE_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { appraisalTemplateSchema, createReviewSchema, submitReviewScoresSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { badRequest, forbidden, notFound } from "../../lib/errors";

export const appraisalsRouter = Router();
appraisalsRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

appraisalsRouter.get(
  "/templates",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.appraisalTemplate.findMany({ where: { is_active: true }, orderBy: { created_at: "desc" } });
    res.json({ success: true, data: templates });
  }),
);

appraisalsRouter.post(
  "/templates",
  authorize(APPRAISAL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = appraisalTemplateSchema.parse(req.body);
    const template = await prisma.appraisalTemplate.create({ data: body });
    res.status(201).json({ success: true, data: template });
  }),
);

// Staff resolve "me" to their own staff id, same shorthand as leave/documents.
// APPRAISAL_MANAGE_ROLES may query any staff_id; everyone else may only
// query their own.
appraisalsRouter.get(
  "/reviews",
  asyncHandler(async (req, res) => {
    const query = req.query as { staff_id?: string };
    const manageAll = APPRAISAL_MANAGE_ROLES.includes(req.user!.role as never);
    let staffId = query.staff_id;
    if (staffId === "me" || (!manageAll && !staffId)) staffId = await resolveOwnStaffId(req.user!.sub);
    if (!manageAll) {
      const ownId = await resolveOwnStaffId(req.user!.sub);
      if (staffId !== ownId) throw forbidden("You can only view your own reviews");
    }

    const reviews = await prisma.performanceReview.findMany({
      where: staffId ? { staff_id: staffId } : {},
      include: { template: true, staff: { select: { name_en: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: reviews });
  }),
);

appraisalsRouter.get(
  "/reviews/export",
  authorize(APPRAISAL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = req.query as { staff_id?: string };
    const reviews = await prisma.performanceReview.findMany({
      where: query.staff_id ? { staff_id: query.staff_id } : {},
      include: { template: { select: { name: true } }, staff: { select: { name_en: true, staff_uid: true } } },
      orderBy: { created_at: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Performance Reviews");
    sheet.columns = [
      { header: "Staff ID", key: "staff_uid", width: 16 },
      { header: "Staff Name", key: "staff_name", width: 22 },
      { header: "Template", key: "template", width: 22 },
      { header: "Review Period", key: "review_period", width: 16 },
      { header: "Overall Score", key: "overall_score", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Submitted At", key: "submitted_at", width: 14 },
    ];
    for (const r of reviews) {
      sheet.addRow({
        staff_uid: r.staff.staff_uid,
        staff_name: r.staff.name_en,
        template: r.template.name,
        review_period: r.review_period,
        overall_score: r.overall_score ?? "",
        status: r.status,
        submitted_at: r.submitted_at ? r.submitted_at.toISOString().slice(0, 10) : "",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Performance_Reviews.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
);

appraisalsRouter.post(
  "/reviews",
  authorize(APPRAISAL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createReviewSchema.parse(req.body);
    const review = await prisma.performanceReview.create({ data: { ...body, reviewer_id: req.user!.sub } });
    res.status(201).json({ success: true, data: review });
  }),
);

appraisalsRouter.put(
  "/reviews/:id/submit",
  authorize(APPRAISAL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const review = await prisma.performanceReview.findUnique({ where: { id }, include: { template: true } });
    if (!review) throw notFound("Review not found");

    const body = submitReviewScoresSchema.parse(req.body);
    const criteria = review.template.criteria as { key: string; label: string; max_score: number }[];
    const criteriaByKey = new Map(criteria.map((c) => [c.key, c]));

    let total = 0;
    for (const [key, value] of Object.entries(body.scores)) {
      const criterion = criteriaByKey.get(key);
      if (!criterion) throw badRequest(`Unknown criterion "${key}"`);
      if (value < 0 || value > criterion.max_score) throw badRequest(`${criterion.label} must be between 0 and ${criterion.max_score}`);
      total += value;
    }

    const updated = await prisma.performanceReview.update({
      where: { id },
      data: { scores: body.scores, overall_score: total, overall_comments: body.overall_comments ?? null, status: "SUBMITTED", submitted_at: new Date() },
    });
    await logAudit("APPRAISAL_SUBMIT", { userId: req.user!.sub, targetType: "PerformanceReview", targetId: id, metadata: { staff_id: review.staff_id, overall_score: total }, req });
    res.json({ success: true, data: updated });
  }),
);

appraisalsRouter.put(
  "/reviews/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const review = await prisma.performanceReview.findUnique({ where: { id } });
    if (!review) throw notFound("Review not found");

    const ownId = await resolveOwnStaffId(req.user!.sub);
    if (review.staff_id !== ownId) throw forbidden("You can only acknowledge your own review");
    if (review.status !== "SUBMITTED") throw badRequest("Only a submitted review can be acknowledged");

    const updated = await prisma.performanceReview.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledged_at: new Date() } });
    res.json({ success: true, data: updated });
  }),
);
