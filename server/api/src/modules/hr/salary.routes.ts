import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES, PAYROLL_READ_ROLES } from "../../lib/roles";
import { salaryStructureSchema } from "@education-erp/validators";

export const salaryStructuresRouter = Router();
salaryStructuresRouter.use(authenticate);

// Read-only, deliberately widened to PAYROLL_READ_ROLES (adds PRINCIPAL) —
// see that constant's own comment in lib/roles.ts. Every write route below
// stays PAYROLL_MANAGE_ROLES-only, unchanged.
salaryStructuresRouter.get(
  "/",
  authorize(PAYROLL_READ_ROLES),
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
    // "Only one default" is enforced here, not a DB constraint — clear the
    // flag on every other row first, in the same transaction, whenever a
    // new row is created as the default.
    const structure = await prisma.$transaction(async (tx) => {
      if (body.is_default) await tx.salaryStructure.updateMany({ where: { is_default: true }, data: { is_default: false } });
      return tx.salaryStructure.create({ data: body });
    });
    res.status(201).json({ success: true, data: structure });
  }),
);

salaryStructuresRouter.put(
  "/:id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = salaryStructureSchema.partial().parse(req.body);
    const structure = await prisma.$transaction(async (tx) => {
      if (body.is_default) await tx.salaryStructure.updateMany({ where: { is_default: true, id: { not: id } }, data: { is_default: false } });
      return tx.salaryStructure.update({ where: { id }, data: body });
    });
    res.json({ success: true, data: structure });
  }),
);
