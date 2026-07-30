import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { gradingScaleSchema } from "@education-erp/validators";
import { validateGradeRanges, GRADING_PRESETS } from "../../lib/grade-range-validation";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { z } from "zod";
import { logAudit } from "../../lib/audit-log";

export const gradingRouter = Router();
gradingRouter.use(authenticate);

gradingRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const scales = await prisma.gradingScale.findMany({
      include: { ranges: { orderBy: { display_order: "asc" } }, _count: { select: { ranges: true } } },
      orderBy: { created_at: "asc" },
    });
    res.json({ success: true, data: scales });
  }),
);

gradingRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const scale = await prisma.gradingScale.findUnique({
      where: { id: reqParam(req, "id") },
      include: { ranges: { orderBy: { display_order: "asc" } } },
    });
    if (!scale) throw notFound("Grading scale not found");
    res.json({ success: true, data: scale });
  }),
);

gradingRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = gradingScaleSchema.parse(req.body);
    const validation = validateGradeRanges(body.ranges);
    if (!validation.valid) throw badRequest("Invalid grade ranges", validation.errors);

    const scale = await prisma.gradingScale.create({
      data: {
        name: body.name,
        scale_type: body.scale_type,
        ranges: { create: body.ranges },
      },
      include: { ranges: true },
    });
    await logAudit("GRADING_SCALE_CREATE", { userId: req.user!.sub, targetType: "GradingScale", targetId: scale.id, metadata: { name: scale.name, scale_type: scale.scale_type }, req });
    res.status(201).json({ success: true, data: scale });
  }),
);

gradingRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = gradingScaleSchema.pick({ name: true, scale_type: true }).parse(req.body);
    const scale = await prisma.gradingScale.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: scale });
  }),
);

gradingRouter.put(
  "/:id/ranges",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ ranges: gradingScaleSchema.shape.ranges }).parse(req.body);
    const validation = validateGradeRanges(body.ranges);
    if (!validation.valid) throw badRequest("Invalid grade ranges", validation.errors);

    const scale = await prisma.$transaction(async (tx) => {
      await tx.gradeRange.deleteMany({ where: { grading_scale_id: reqParam(req, "id") } });
      return tx.gradingScale.update({
        where: { id: reqParam(req, "id") },
        data: { ranges: { create: body.ranges } },
        include: { ranges: { orderBy: { display_order: "asc" } } },
      });
    });
    res.json({ success: true, data: scale });
  }),
);

gradingRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const usedByExam = await prisma.exam.findFirst({ where: { grading_scale_id: reqParam(req, "id") } });
    if (usedByExam) throw conflict("This grading scale is used by an exam and cannot be deleted");
    const scale = await prisma.gradingScale.findUnique({ where: { id: reqParam(req, "id") }, select: { name: true } });
    await prisma.gradeRange.deleteMany({ where: { grading_scale_id: reqParam(req, "id") } });
    await prisma.gradingScale.delete({ where: { id: reqParam(req, "id") } });
    await logAudit("GRADING_SCALE_DELETE", { userId: req.user!.sub, targetType: "GradingScale", targetId: reqParam(req, "id"), metadata: { name: scale?.name }, req });
    res.status(204).send();
  }),
);

gradingRouter.post(
  "/:id/default",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.$transaction([
      prisma.gradingScale.updateMany({ data: { is_default: false }, where: {} }),
      prisma.gradingScale.update({ where: { id: reqParam(req, "id") }, data: { is_default: true } }),
    ]);
    await logAudit("GRADING_SCALE_SET_DEFAULT", { userId: req.user!.sub, targetType: "GradingScale", targetId: reqParam(req, "id"), req });
    res.json({ success: true, message: "Default grading scale updated" });
  }),
);

gradingRouter.post(
  "/presets/apply",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ preset: z.enum(["BD_BOARD", "CGPA_4", "CGPA_5", "PERCENTAGE"]) }).parse(req.body);
    const preset = GRADING_PRESETS[body.preset];
    if (!preset) throw badRequest("Unknown preset");

    const scale = await prisma.gradingScale.create({
      data: {
        name: body.preset.replace(/_/g, " "),
        scale_type: preset.scale_type,
        ranges: { create: preset.ranges },
      },
      include: { ranges: { orderBy: { display_order: "asc" } } },
    });
    await logAudit("GRADING_SCALE_CREATE", { userId: req.user!.sub, targetType: "GradingScale", targetId: scale.id, metadata: { name: scale.name, scale_type: scale.scale_type, from_preset: body.preset }, req });
    res.status(201).json({ success: true, data: scale });
  }),
);
