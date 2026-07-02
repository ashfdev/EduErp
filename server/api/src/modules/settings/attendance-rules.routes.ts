import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { attendanceRulesSchema } from "@education-erp/validators";

export const attendanceRulesRouter = Router();
const RULES_ID = "singleton";
attendanceRulesRouter.use(authenticate);

attendanceRulesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rules = await prisma.attendanceRules.findUnique({ where: { id: RULES_ID } });
    res.json({ success: true, data: rules });
  }),
);

attendanceRulesRouter.put(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = attendanceRulesSchema.parse(req.body);
    const rules = await prisma.attendanceRules.update({ where: { id: RULES_ID }, data: body });
    res.json({ success: true, data: rules });
  }),
);
