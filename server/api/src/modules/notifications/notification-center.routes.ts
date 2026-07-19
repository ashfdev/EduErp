import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { reqParam } from "../../lib/req-param";
import { notFound } from "../../lib/errors";

// The personal notification-center feed — works identically for staff,
// teacher, and portal callers since InAppNotification.user_id is a raw
// User.id, same convention as Complaint.raised_by_user_id. Mounted at the
// same /api/notifications prefix as bulk.routes.ts's bulkSmsRouter (no
// path collision — that router only defines /bulk-sms and /bulk-sms/preview).
export const notificationCenterRouter = Router();
notificationCenterRouter.use(authenticate);

notificationCenterRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ unread: z.enum(["true", "false"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) })
      .parse(req.query);
    const where = { user_id: req.user!.sub, ...(query.unread === "true" && { is_read: false }) };
    const [notifications, unreadCount] = await Promise.all([
      prisma.inAppNotification.findMany({ where, orderBy: { created_at: "desc" }, take: query.limit }),
      prisma.inAppNotification.count({ where: { user_id: req.user!.sub, is_read: false } }),
    ]);
    res.json({ success: true, data: notifications, meta: { unread_count: unreadCount } });
  }),
);

notificationCenterRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.inAppNotification.findUnique({ where: { id } });
    if (!existing || existing.user_id !== req.user!.sub) throw notFound("Notification not found");
    const updated = await prisma.inAppNotification.update({ where: { id }, data: { is_read: true } });
    res.json({ success: true, data: updated });
  }),
);

notificationCenterRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma.inAppNotification.updateMany({
      where: { user_id: req.user!.sub, is_read: false },
      data: { is_read: true },
    });
    res.json({ success: true, data: { updated: result.count } });
  }),
);
