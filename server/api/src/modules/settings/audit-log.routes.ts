import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_INSTITUTION_ROLES } from "../../lib/roles";

export const auditLogRouter = Router();
auditLogRouter.use(authenticate, authorize(SETTINGS_INSTITUTION_ROLES));

auditLogRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        action: z.string().optional(),
        user_id: z.string().optional(),
        target_type: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const where = {
      ...(query.action && { action: query.action }),
      ...(query.user_id && { user_id: query.user_id }),
      ...(query.target_type && { target_type: query.target_type }),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { created_at: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);
