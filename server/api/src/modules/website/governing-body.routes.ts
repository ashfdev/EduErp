import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { governingBodyMemberSchema, governingBodyReorderSchema } from "@education-erp/validators";
import { triggerRevalidation } from "../../services/revalidate.service";
import { badRequest, notFound } from "../../lib/errors";

export const governingBodyRouter = Router();
governingBodyRouter.use(authenticate);

governingBodyRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const group = req.query.group as string | undefined;
    const members = await prisma.governingBodyMember.findMany({
      where: group ? { group } : undefined,
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: members });
  }),
);

governingBodyRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = governingBodyMemberSchema.parse(req.body);
    const count = await prisma.governingBodyMember.count();
    const member = await prisma.governingBodyMember.create({ data: { ...body, display_order: body.display_order ?? count } });
    if (member.is_active) await triggerRevalidation(["/governing-body"]);
    res.status(201).json({ success: true, data: member });
  }),
);

governingBodyRouter.put(
  "/reorder",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = governingBodyReorderSchema.parse(req.body);
    await prisma.$transaction(body.map((m) => prisma.governingBodyMember.update({ where: { id: m.id }, data: { display_order: m.display_order } })));
    await triggerRevalidation(["/governing-body"]);
    res.json({ success: true, message: "Order updated" });
  }),
);

governingBodyRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const body = governingBodyMemberSchema.partial().parse(req.body);
    const member = await prisma.governingBodyMember.update({ where: { id: reqParam(req, "id") }, data: body });
    await triggerRevalidation(["/governing-body"]);
    res.json({ success: true, data: member });
  }),
);

governingBodyRouter.delete(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.governingBodyMember.delete({ where: { id: reqParam(req, "id") } });
    await triggerRevalidation(["/governing-body"]);
    res.status(204).send();
  }),
);

governingBodyRouter.post(
  "/:id/photo",
  authorize(WEBSITE_CONTENT_ROLES),
  imageUpload.single("photo"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.governingBodyMember.findUnique({ where: { id } });
    if (!existing) throw notFound("Member not found");
    if (!req.file) throw badRequest("A photo file is required");

    const { url } = await uploadBuffer("governing-body", req.file.originalname, req.file.buffer, req.file.mimetype);
    const member = await prisma.governingBodyMember.update({ where: { id }, data: { photo_url: url } });
    await triggerRevalidation(["/governing-body"]);
    res.json({ success: true, data: member });
  }),
);
