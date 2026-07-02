import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { notificationConfigUpdateSchema } from "@education-erp/validators";
import { sendSms } from "../../services/sms.service";
import { z } from "zod";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const configs = await prisma.notificationConfig.findMany({ orderBy: [{ trigger: "asc" }, { channel: "asc" }] });
    res.json({ success: true, data: configs });
  }),
);

notificationsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = notificationConfigUpdateSchema.parse(req.body);
    const config = await prisma.notificationConfig.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: config });
  }),
);

notificationsRouter.post(
  "/test",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ phone: z.string().regex(/^01\d{9}$/), message: z.string().min(1) }).parse(req.body);
    const result = await sendSms(body.phone, body.message);
    res.json({ success: true, data: result });
  }),
);
