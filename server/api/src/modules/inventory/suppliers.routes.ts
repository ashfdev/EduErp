import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { INVENTORY_MANAGE_ROLES } from "../../lib/roles";
import { supplierSchema } from "@education-erp/validators";
import { conflict, notFound } from "../../lib/errors";

export const suppliersRouter = Router();
suppliersRouter.use(authenticate, authorize(INVENTORY_MANAGE_ROLES));

suppliersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: suppliers });
  }),
);

suppliersRouter.post(
  "/",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = supplierSchema.parse(req.body);
    const supplier = await prisma.supplier.create({ data: body });
    res.status(201).json({ success: true, data: supplier });
  }),
);

suppliersRouter.put(
  "/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw notFound("Supplier not found");
    const body = supplierSchema.partial().parse(req.body);
    const supplier = await prisma.supplier.update({ where: { id }, data: body });
    res.json({ success: true, data: supplier });
  }),
);

suppliersRouter.delete(
  "/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const poCount = await prisma.purchaseOrder.count({ where: { supplier_id: id } });
    if (poCount > 0) throw conflict("Cannot delete a supplier with existing purchase orders");
    await prisma.supplier.update({ where: { id }, data: { is_active: false } });
    res.status(204).send();
  }),
);
