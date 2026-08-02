import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { ADMISSION_MANAGE_ROLES } from "../../lib/roles";
import { admissionPaymentInstructionsSchema } from "@education-erp/validators";

export const admissionPaymentInstructionsRouter = Router();
const INSTRUCTIONS_ID = "singleton";
admissionPaymentInstructionsRouter.use(authenticate);

admissionPaymentInstructionsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const instructions = await prisma.admissionPaymentInstructions.findUnique({ where: { id: INSTRUCTIONS_ID } });
    res.json({ success: true, data: instructions });
  }),
);

admissionPaymentInstructionsRouter.put(
  "/",
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = admissionPaymentInstructionsSchema.parse(req.body);
    const instructions = await prisma.admissionPaymentInstructions.upsert({
      where: { id: INSTRUCTIONS_ID },
      update: body,
      create: { id: INSTRUCTIONS_ID, ...body },
    });
    res.json({ success: true, data: instructions });
  }),
);
