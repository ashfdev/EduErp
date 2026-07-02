import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { eventSchema } from "@education-erp/validators";

export const eventsRouter = Router();
eventsRouter.use(authenticate);

eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ type: z.string().optional(), month: z.coerce.number().int().optional(), year: z.coerce.number().int().optional() }).parse(req.query);
    const where: Record<string, unknown> = query.type ? { type: query.type } : {};
    if (query.month && query.year) {
      where.date_from = { gte: new Date(query.year, query.month - 1, 1), lt: new Date(query.year, query.month, 1) };
    }
    const events = await prisma.event.findMany({ where, orderBy: { date_from: "asc" } });
    res.json({ success: true, data: events });
  }),
);

eventsRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = eventSchema.parse(req.body);
    const event = await prisma.event.create({ data: body });
    res.status(201).json({ success: true, data: event });
  }),
);

eventsRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = eventSchema.partial().parse(req.body);
    const event = await prisma.event.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: event });
  }),
);

eventsRouter.delete(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.event.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);
