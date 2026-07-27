import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { markCompositionTemplateSchema } from "@education-erp/validators";
import { conflict, notFound } from "../../lib/errors";

// Standalone, named, reusable mark-composition templates (e.g. "SSC
// Standard" = Theory 70/MCQ 20/Practical 10) — built once here, picked by
// name when configuring a subject's mark composition for a specific exam.
// Independent of Exam Type and of Clone Exam, per the owner's confirmed
// choice of a separate saved template list over clone-based reuse.
export const markCompositionTemplatesRouter = Router();
markCompositionTemplatesRouter.use(authenticate);

markCompositionTemplatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.markCompositionTemplate.findMany({
      include: { items: { orderBy: { display_order: "asc" } } },
      orderBy: { created_at: "asc" },
    });
    res.json({ success: true, data: templates });
  }),
);

markCompositionTemplatesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await prisma.markCompositionTemplate.findUnique({
      where: { id: reqParam(req, "id") },
      include: { items: { orderBy: { display_order: "asc" } } },
    });
    if (!template) throw notFound("Mark composition template not found");
    res.json({ success: true, data: template });
  }),
);

markCompositionTemplatesRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = markCompositionTemplateSchema.parse(req.body);
    const template = await prisma.markCompositionTemplate.create({
      data: {
        name: body.name,
        items: { create: body.items.map((item, i) => ({ ...item, display_order: item.display_order ?? i })) },
      },
      include: { items: { orderBy: { display_order: "asc" } } },
    });
    res.status(201).json({ success: true, data: template });
  }),
);

markCompositionTemplatesRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = markCompositionTemplateSchema.parse(req.body);

    const template = await prisma.$transaction(async (tx) => {
      await tx.markCompositionTemplateItem.deleteMany({ where: { template_id: id } });
      return tx.markCompositionTemplate.update({
        where: { id },
        data: {
          name: body.name,
          items: { create: body.items.map((item, i) => ({ ...item, display_order: item.display_order ?? i })) },
        },
        include: { items: { orderBy: { display_order: "asc" } } },
      });
    });
    res.json({ success: true, data: template });
  }),
);

markCompositionTemplatesRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    // A template is only ever a client-side pre-fill source for a draft
    // (see PUT /:exam_id/subject-config/:subject_id/mark-components) — no
    // exam/subject row ever stores a reference back to it, so there is
    // nothing to guard against here; deleting it never orphans live data.
    await prisma.markCompositionTemplate.delete({ where: { id } }).catch(() => {
      throw conflict("Mark composition template not found or already removed");
    });
    res.status(204).send();
  }),
);
