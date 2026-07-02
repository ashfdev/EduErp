import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { feeRulesSchema } from "@education-erp/validators";

export const feeRulesRouter = Router();
const RULES_ID = "singleton";
feeRulesRouter.use(authenticate);

feeRulesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rules = await prisma.feeRules.findUnique({ where: { id: RULES_ID } });
    res.json({ success: true, data: rules });
  }),
);

feeRulesRouter.put(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = feeRulesSchema.parse(req.body);
    const rules = await prisma.feeRules.update({ where: { id: RULES_ID }, data: body });
    res.json({ success: true, data: rules });
  }),
);
