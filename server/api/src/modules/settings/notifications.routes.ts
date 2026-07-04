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

notificationsRouter.get(
  "/logs",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]).optional(),
        channel: z.enum(["SMS", "EMAIL", "PUSH"]).optional(),
        trigger: z.enum(["ABSENCE", "LATE", "FEE_DUE", "RESULT_PUBLISHED", "NOTICE", "ADMISSION_CONFIRM"]).optional(),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const where = {
      ...(query.status && { status: query.status }),
      ...(query.channel && { channel: query.channel }),
      ...(query.trigger && { trigger: query.trigger }),
      ...((query.from_date || query.to_date) && {
        created_at: {
          ...(query.from_date && { gte: new Date(query.from_date) }),
          ...(query.to_date && { lte: new Date(query.to_date) }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notificationLog.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);
