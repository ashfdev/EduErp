import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { marksheetDisplaySettingsSchema } from "@education-erp/validators";

export const marksheetDisplayRouter = Router();
const SETTINGS_ID = "singleton";
marksheetDisplayRouter.use(authenticate);

// Upsert-on-read (rather than a plain findUnique like FeeRules/
// AttendanceRules use) -- this model was added after this project's dev DB
// was already seeded, so a plain lookup could return null on a database
// that hasn't been reseeded since. Auto-creating the default row here means
// it's always safe to render, no reseed required.
marksheetDisplayRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.marksheetDisplaySettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    res.json({ success: true, data: settings });
  }),
);

marksheetDisplayRouter.put(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = marksheetDisplaySettingsSchema.parse(req.body);
    const settings = await prisma.marksheetDisplaySettings.upsert({
      where: { id: SETTINGS_ID },
      update: body,
      create: { id: SETTINGS_ID, ...body },
    });
    res.json({ success: true, data: settings });
  }),
);
