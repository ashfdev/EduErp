import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { importantLinkSchema } from "@education-erp/validators";
import { triggerRevalidation } from "../../services/revalidate.service";
import { notFound } from "../../lib/errors";

export const importantLinksRouter = Router();
importantLinksRouter.use(authenticate);

importantLinksRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const links = await prisma.importantLink.findMany({ orderBy: { display_order: "asc" } });
    res.json({ success: true, data: links });
  }),
);

importantLinksRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = importantLinkSchema.parse(req.body);
    const link = await prisma.importantLink.create({ data: body });
    await triggerRevalidation(["/"]);
    res.status(201).json({ success: true, data: link });
  }),
);

importantLinksRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.importantLink.findUnique({ where: { id } });
    if (!existing) throw notFound("Link not found");
    const body = importantLinkSchema.partial().parse(req.body);
    const link = await prisma.importantLink.update({ where: { id }, data: body });
    await triggerRevalidation(["/"]);
    res.json({ success: true, data: link });
  }),
);

importantLinksRouter.delete(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.importantLink.delete({ where: { id: reqParam(req, "id") } });
    await triggerRevalidation(["/"]);
    res.status(204).send();
  }),
);
