import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STAFF_ONLY_ROLES } from "../../lib/roles";
import { visitorSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

// General campus Gate Pass (Plan Thirteen, Phase H) — deliberately generalizes
// HostelVisitor's shape into a new, independent, campus-wide model rather than
// merging into or repurposing it (HostelVisitor stays exactly as-is, hostel-
// resident visits only). Unlike hostel.routes.ts's own visitor routes (whose
// GET has no authorize() at all beyond authenticate — a known, pre-existing
// gap, flagged separately, not fixed here since it's a different table), this
// router gates every route with STAFF_ONLY_ROLES from the start.
export const gatePassRouter = Router();
gatePassRouter.use(authenticate);
gatePassRouter.use(authorize(STAFF_ONLY_ROLES));

gatePassRouter.post(
  "/visitors",
  asyncHandler(async (req, res) => {
    const body = visitorSchema.parse(req.body);
    const visitor = await prisma.visitor.create({ data: { ...body, approved_by_id: req.user!.sub } });
    res.status(201).json({ success: true, data: visitor });
  }),
);

gatePassRouter.get(
  "/visitors",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        active: z.string().optional(),
        date: z.string().optional(),
        student_id: z.string().optional(),
        class_id: z.string().optional(),
      })
      .parse(req.query);

    const where = {
      ...(query.active === "true" && { out_time: null }),
      ...(query.student_id && { student_id: query.student_id }),
      ...(query.class_id && { class_id: query.class_id }),
      ...(query.date && {
        in_time: {
          gte: new Date(`${query.date}T00:00:00.000Z`),
          lt: new Date(`${query.date}T23:59:59.999Z`),
        },
      }),
    };

    const visitors = await prisma.visitor.findMany({
      where,
      include: {
        student: { select: { id: true, name_en: true, student_uid: true } },
        class: { select: { id: true, name_en: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: { in_time: "desc" },
      take: 200,
    });
    res.json({ success: true, data: visitors });
  }),
);

gatePassRouter.put(
  "/visitors/:id/checkout",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const visitor = await prisma.visitor.findUnique({ where: { id } });
    if (!visitor) throw notFound("Visitor record not found");
    if (visitor.out_time) throw badRequest("This visitor has already checked out");

    const updated = await prisma.visitor.update({ where: { id }, data: { out_time: new Date() } });
    res.json({ success: true, data: updated });
  }),
);
