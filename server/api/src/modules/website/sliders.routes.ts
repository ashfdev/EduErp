import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { sliderSchema, sliderReorderSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

export const slidersRouter = Router();
slidersRouter.use(authenticate);

slidersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const sliders = await prisma.sliderImage.findMany({ orderBy: { display_order: "asc" } });
    res.json({ success: true, data: sliders });
  }),
);

slidersRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  imageUpload.single("image"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const body = sliderSchema.omit({ image_url: true }).parse(req.body);
    if (!req.file) throw badRequest("An image file is required");

    const { url } = await uploadBuffer("sliders", req.file.originalname, req.file.buffer, req.file.mimetype);
    const count = await prisma.sliderImage.count();
    const slider = await prisma.sliderImage.create({ data: { ...body, image_url: url, display_order: count } });
    res.status(201).json({ success: true, data: slider });
  }),
);

slidersRouter.put(
  "/reorder",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = sliderReorderSchema.parse(req.body);
    await prisma.$transaction(body.map((s) => prisma.sliderImage.update({ where: { id: s.id }, data: { display_order: s.display_order } })));
    res.json({ success: true, message: "Slider order updated" });
  }),
);

slidersRouter.put(
  "/:id/toggle",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ is_active: z.boolean() }).parse(req.body);
    const slider = await prisma.sliderImage.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: slider });
  }),
);

slidersRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  imageUpload.single("image"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const body = sliderSchema.omit({ image_url: true }).partial().parse(req.body);
    const existing = await prisma.sliderImage.findUnique({ where: { id: reqParam(req, "id") } });
    if (!existing) throw notFound("Slider not found");

    let image_url: string | undefined;
    if (req.file) {
      image_url = (await uploadBuffer("sliders", req.file.originalname, req.file.buffer, req.file.mimetype)).url;
    }

    const slider = await prisma.sliderImage.update({ where: { id: existing.id }, data: { ...body, ...(image_url && { image_url }) } });
    res.json({ success: true, data: slider });
  }),
);

slidersRouter.delete(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.sliderImage.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);
