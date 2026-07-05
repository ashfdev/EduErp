import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { galleryAlbumSchema, galleryImageReorderSchema } from "@education-erp/validators";
import { triggerRevalidation } from "../../services/revalidate.service";
import { badRequest, notFound } from "../../lib/errors";

export const galleryRouter = Router();
galleryRouter.use(authenticate);

galleryRouter.get(
  "/albums",
  asyncHandler(async (_req, res) => {
    const albums = await prisma.galleryAlbum.findMany({
      include: { _count: { select: { images: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: albums });
  }),
);

galleryRouter.get(
  "/albums/:id",
  asyncHandler(async (req, res) => {
    const album = await prisma.galleryAlbum.findUnique({ where: { id: reqParam(req, "id") }, include: { images: { orderBy: { display_order: "asc" } } } });
    if (!album) throw notFound("Album not found");
    res.json({ success: true, data: album });
  }),
);

galleryRouter.post(
  "/albums",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = galleryAlbumSchema.parse({ ...req.body, is_public: req.body.is_public === "true" || req.body.is_public === true || req.body.is_public === undefined });
    const album = await prisma.galleryAlbum.create({ data: body });
    if (album.is_public) await triggerRevalidation(["/gallery"]);
    res.status(201).json({ success: true, data: album });
  }),
);

galleryRouter.put(
  "/albums/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = galleryAlbumSchema.partial().parse(req.body);
    const album = await prisma.galleryAlbum.update({ where: { id: reqParam(req, "id") }, data: body });
    await triggerRevalidation(["/gallery", `/gallery/${album.id}`]);
    res.json({ success: true, data: album });
  }),
);

galleryRouter.delete(
  "/albums/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await prisma.galleryImage.deleteMany({ where: { album_id: id } });
    await prisma.galleryAlbum.delete({ where: { id } });
    await triggerRevalidation(["/gallery", `/gallery/${id}`]);
    res.status(204).send();
  }),
);

galleryRouter.post(
  "/albums/:id/cover",
  authorize(WEBSITE_CONTENT_ROLES),
  imageUpload.single("cover"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    if (!req.file) throw badRequest("A cover image file is required");
    const { url } = await uploadBuffer("gallery", req.file.originalname, req.file.buffer, req.file.mimetype);
    const album = await prisma.galleryAlbum.update({ where: { id }, data: { cover_url: url } });
    await triggerRevalidation(["/gallery", `/gallery/${id}`]);
    res.json({ success: true, data: album });
  }),
);

galleryRouter.post(
  "/albums/:id/images",
  authorize(WEBSITE_CONTENT_ROLES),
  imageUpload.array("images", 20),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const albumId = reqParam(req, "id");
    const album = await prisma.galleryAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw notFound("Album not found");

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest("At least one image file is required");

    const count = await prisma.galleryImage.count({ where: { album_id: albumId } });
    const failed: string[] = [];
    let uploaded = 0;

    for (const [index, file] of files.entries()) {
      try {
        const { url } = await uploadBuffer("gallery", file.originalname, file.buffer, file.mimetype);
        await prisma.galleryImage.create({ data: { album_id: albumId, image_url: url, thumbnail_url: url, display_order: count + index } });
        uploaded++;
      } catch {
        failed.push(file.originalname);
      }
    }

    if (!album.cover_url && uploaded > 0) {
      const firstImage = await prisma.galleryImage.findFirst({ where: { album_id: albumId }, orderBy: { display_order: "asc" } });
      if (firstImage) await prisma.galleryAlbum.update({ where: { id: albumId }, data: { cover_url: firstImage.image_url } });
    }

    if (uploaded > 0) await triggerRevalidation(["/gallery", `/gallery/${albumId}`]);
    res.status(201).json({ success: true, data: { uploaded, failed } });
  }),
);

galleryRouter.delete(
  "/images/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const image = await prisma.galleryImage.delete({ where: { id: reqParam(req, "id") } });
    await triggerRevalidation(["/gallery", `/gallery/${image.album_id}`]);
    res.status(204).send();
  }),
);

galleryRouter.put(
  "/images/reorder",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = galleryImageReorderSchema.parse(req.body);
    const updated = await prisma.$transaction(body.map((i) => prisma.galleryImage.update({ where: { id: i.id }, data: { display_order: i.display_order } })));
    const albumIds = [...new Set(updated.map((i) => i.album_id))];
    await triggerRevalidation(["/gallery", ...albumIds.map((id) => `/gallery/${id}`)]);
    res.json({ success: true, message: "Image order updated" });
  }),
);
