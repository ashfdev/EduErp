import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { HR_MANAGE_ROLES } from "../../lib/roles";
import { jobPostingSchema } from "@education-erp/validators";

export const jobsRouter = Router();
jobsRouter.use(authenticate);

jobsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const jobs = await prisma.jobPosting.findMany({ orderBy: { created_at: "desc" } });
    res.json({ success: true, data: jobs });
  }),
);

jobsRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = jobPostingSchema.parse(req.body);
    const job = await prisma.jobPosting.create({ data: body });
    res.status(201).json({ success: true, data: job });
  }),
);

jobsRouter.put(
  "/:id/toggle",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ is_published: z.boolean() }).parse(req.body);
    const job = await prisma.jobPosting.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: job });
  }),
);
