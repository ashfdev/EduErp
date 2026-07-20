import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { salaryStructureSchema } from "@education-erp/validators";

export const salaryStructuresRouter = Router();
salaryStructuresRouter.use(authenticate, authorize(PAYROLL_MANAGE_ROLES));

salaryStructuresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const structures = await prisma.salaryStructure.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: structures });
  }),
);

salaryStructuresRouter.post(
  "/",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = salaryStructureSchema.parse(req.body);
    const structure = await prisma.salaryStructure.create({ data: body });
    res.status(201).json({ success: true, data: structure });
  }),
);

salaryStructuresRouter.put(
  "/:id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = salaryStructureSchema.partial().parse(req.body);
    const structure = await prisma.salaryStructure.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: structure });
  }),
);
