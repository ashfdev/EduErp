import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { examTypeConfigSchema } from "@education-erp/validators";
import { conflict } from "../../lib/errors";

export const examTypesRouter = Router();
examTypesRouter.use(authenticate);

examTypesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const types = await prisma.examTypeConfig.findMany({ orderBy: { display_order: "asc" } });
    res.json({ success: true, data: types });
  }),
);

examTypesRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = examTypeConfigSchema.parse(req.body);
    const type = await prisma.examTypeConfig.create({ data: body });
    res.status(201).json({ success: true, data: type });
  }),
);

examTypesRouter.put(
  "/reorder",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.array(z.object({ id: z.string(), display_order: z.number().int() })).parse(req.body);
    await prisma.$transaction(
      body.map((item) => prisma.examTypeConfig.update({ where: { id: item.id }, data: { display_order: item.display_order } })),
    );
    res.json({ success: true, message: "Order updated" });
  }),
);

examTypesRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = examTypeConfigSchema.partial().parse(req.body);
    const type = await prisma.examTypeConfig.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: type });
  }),
);

examTypesRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const usedByExam = await prisma.exam.findFirst({ where: { exam_type_config_id: reqParam(req, "id") } });
    if (usedByExam) throw conflict("This exam type is used by an exam and cannot be deleted");
    await prisma.examTypeConfig.update({ where: { id: reqParam(req, "id") }, data: { is_active: false } });
    res.status(204).send();
  }),
);
