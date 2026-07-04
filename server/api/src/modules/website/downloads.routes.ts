import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { downloadMetaSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

export const downloadsRouter = Router();
downloadsRouter.use(authenticate);

downloadsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ category: z.string().optional(), academic_year_id: z.string().optional(), is_public: z.string().optional() }).parse(req.query);
    const downloads = await prisma.download.findMany({
      where: {
        ...(query.category && { category: query.category as never }),
        ...(query.academic_year_id && { academic_year_id: query.academic_year_id }),
        ...(query.is_public !== undefined && { is_public: query.is_public === "true" }),
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: downloads });
  }),
);

downloadsRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const body = downloadMetaSchema.parse({ ...req.body, is_public: req.body.is_public === "true" || req.body.is_public === true || req.body.is_public === undefined });
    if (!req.file) throw badRequest("A file is required");

    const { url } = await uploadBuffer("downloads", req.file.originalname, req.file.buffer, req.file.mimetype);
    const download = await prisma.download.create({ data: { ...body, file_url: url, file_name: req.file.originalname } });
    res.status(201).json({ success: true, data: download });
  }),
);

downloadsRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.download.findUnique({ where: { id: reqParam(req, "id") } });
    if (!existing) throw notFound("Download not found");
    const body = downloadMetaSchema.partial().parse(req.body);
    const download = await prisma.download.update({ where: { id: existing.id }, data: body });
    res.json({ success: true, data: download });
  }),
);

downloadsRouter.delete(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.download.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);
