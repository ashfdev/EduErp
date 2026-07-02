import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";

export const contactRouter = Router();
contactRouter.use(authenticate);

contactRouter.get(
  "/submissions",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (_req, res) => {
    const submissions = await prisma.contactSubmission.findMany({ orderBy: { created_at: "desc" } });
    res.json({ success: true, data: submissions });
  }),
);

contactRouter.put(
  "/submissions/:id/read",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const submission = await prisma.contactSubmission.update({ where: { id: reqParam(req, "id") }, data: { is_read: true } });
    res.json({ success: true, data: submission });
  }),
);
