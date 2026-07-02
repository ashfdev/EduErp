import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { upload } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { noticeSchema } from "@education-erp/validators";
import { sendSms } from "../../services/sms.service";
import { triggerRevalidation } from "../../services/revalidate.service";
import { notFound } from "../../lib/errors";

export const noticesRouter = Router();
noticesRouter.use(authenticate);

async function audiencePhones(audience: string): Promise<string[]> {
  const phones: string[] = [];
  if (audience === "STUDENTS" || audience === "ALL") {
    const students = await prisma.student.findMany({ where: { deleted_at: null, father_phone: { not: null } }, select: { father_phone: true } });
    phones.push(...students.map((s) => s.father_phone!));
  }
  if (audience === "GUARDIANS" || audience === "ALL") {
    const guardians = await prisma.guardian.findMany({ select: { phone: true } });
    phones.push(...guardians.map((g) => g.phone));
  }
  if (audience === "STAFF" || audience === "ALL") {
    const staff = await prisma.staff.findMany({ where: { is_active: true, deleted_at: null, phone: { not: null } }, select: { phone: true } });
    phones.push(...staff.map((s) => s.phone!));
  }
  return [...new Set(phones)];
}

noticesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ audience: z.string().optional(), is_published: z.string().optional(), search: z.string().optional() }).parse(req.query);
    const notices = await prisma.notice.findMany({
      where: {
        ...(query.audience && { audience: query.audience as never }),
        ...(query.is_published !== undefined && { is_published: query.is_published === "true" }),
        ...(query.search && { title: { contains: query.search, mode: "insensitive" } }),
      },
      orderBy: [{ is_pinned: "desc" }, { created_at: "desc" }],
    });
    res.json({ success: true, data: notices });
  }),
);

noticesRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    const body = noticeSchema.omit({ attachment_url: true }).parse({
      ...req.body,
      is_pinned: req.body.is_pinned === "true" || req.body.is_pinned === true,
      is_public_website: req.body.is_public_website === "true" || req.body.is_public_website === true,
      send_sms: req.body.send_sms === "true" || req.body.send_sms === true,
    });

    let attachment_url: string | undefined;
    if (req.file) attachment_url = (await uploadBuffer("notices", req.file.originalname, req.file.buffer, req.file.mimetype)).url;

    const notice = await prisma.notice.create({ data: { ...body, attachment_url, created_by_id: req.user!.sub } });
    res.status(201).json({ success: true, data: notice });
  }),
);

noticesRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.notice.findUnique({ where: { id: reqParam(req, "id") } });
    if (!existing) throw notFound("Notice not found");

    const body = noticeSchema.omit({ attachment_url: true }).partial().parse({
      ...req.body,
      ...(req.body.is_pinned !== undefined && { is_pinned: req.body.is_pinned === "true" || req.body.is_pinned === true }),
      ...(req.body.is_public_website !== undefined && { is_public_website: req.body.is_public_website === "true" || req.body.is_public_website === true }),
      ...(req.body.send_sms !== undefined && { send_sms: req.body.send_sms === "true" || req.body.send_sms === true }),
    });

    let attachment_url: string | undefined;
    if (req.file) attachment_url = (await uploadBuffer("notices", req.file.originalname, req.file.buffer, req.file.mimetype)).url;

    const notice = await prisma.notice.update({ where: { id: existing.id }, data: { ...body, ...(attachment_url && { attachment_url }) } });
    res.json({ success: true, data: notice });
  }),
);

noticesRouter.delete(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.notice.update({ where: { id: reqParam(req, "id") }, data: { is_published: false, expire_at: new Date() } });
    res.status(204).send();
  }),
);

noticesRouter.post(
  "/:id/publish",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.notice.findUnique({ where: { id } });
    if (!existing) throw notFound("Notice not found");

    const notice = await prisma.notice.update({ where: { id }, data: { is_published: true, publish_at: new Date() } });
    if (notice.is_public_website) await triggerRevalidation(["/notices"]);
    res.json({ success: true, data: notice });
  }),
);

noticesRouter.post(
  "/:id/unpublish",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const notice = await prisma.notice.update({ where: { id: reqParam(req, "id") }, data: { is_published: false } });
    await triggerRevalidation(["/notices"]);
    res.json({ success: true, data: notice });
  }),
);

noticesRouter.post(
  "/:id/send-sms",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ override_audience: z.string().optional() }).parse(req.body);
    const notice = await prisma.notice.findUnique({ where: { id } });
    if (!notice) throw notFound("Notice not found");

    const phones = await audiencePhones(body.override_audience ?? notice.audience);
    for (const phone of phones) {
      await sendSms(phone, `${notice.title}: ${notice.body.slice(0, 100)}`);
    }
    await prisma.notice.update({ where: { id }, data: { sms_sent_at: new Date() } });

    res.json({ success: true, data: { queued: phones.length } });
  }),
);
