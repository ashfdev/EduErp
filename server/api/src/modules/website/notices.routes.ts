import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { sanitizeHtml } from "../../lib/sanitize";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { noticeSchema } from "@education-erp/validators";
import { sendNotification, type NotificationRecipient } from "../../services/notification.service";
import { triggerRevalidation } from "../../services/revalidate.service";
import { badRequest, notFound } from "../../lib/errors";
import { createInAppNotification } from "../../services/in-app-notification.service";

export const noticesRouter = Router();
noticesRouter.use(authenticate);

// _origin tags which app a recipient actually logs into — needed so the
// in-app-notification `link` below can point somewhere that actually
// resolves for that recipient. sendNotification() (SMS/email/push) never
// reads this extra field, so it's harmless to the existing call site that
// still passes this same array through unchanged.
type OriginTaggedRecipient = NotificationRecipient & { _origin: "portal" | "staff" };

async function audienceRecipients(audience: string): Promise<OriginTaggedRecipient[]> {
  const recipients: OriginTaggedRecipient[] = [];
  if (audience === "STUDENTS" || audience === "ALL") {
    const students = await prisma.student.findMany({
      where: { deleted_at: null, father_phone: { not: null } },
      select: { id: true, name_en: true, father_phone: true, guardian: { select: { user_id: true, email: true } } },
    });
    recipients.push(...students.map((s) => ({ name: s.name_en, phone: s.father_phone, email: s.guardian?.email, user_id: s.guardian?.user_id, person_id: s.id, _origin: "portal" as const })));
  }
  if (audience === "GUARDIANS" || audience === "ALL") {
    const guardians = await prisma.guardian.findMany({ select: { id: true, name_en: true, phone: true, email: true, user_id: true } });
    recipients.push(...guardians.map((g) => ({ name: g.name_en, phone: g.phone, email: g.email, user_id: g.user_id, person_id: g.id, _origin: "portal" as const })));
  }
  if (audience === "STAFF" || audience === "ALL") {
    const staff = await prisma.staff.findMany({ where: { is_active: true, deleted_at: null, phone: { not: null } }, select: { id: true, name_en: true, phone: true, email: true, user_id: true } });
    recipients.push(...staff.map((s) => ({ name: s.name_en, phone: s.phone, email: s.email, user_id: s.user_id, person_id: s.id, _origin: "staff" as const })));
  }
  // Dedup by phone — the same guardian/staff-parent shouldn't get the same notice twice.
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.phone ?? r.user_id ?? r.email ?? "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

noticesRouter.get(
  "/",
  // This is the admin-panel management list (dashboard "recent notices" widget for
  // any staff role, plus the Notices admin page for WEBSITE_CONTENT_ROLES) — it
  // returns every audience including unpublished drafts, so it must never be
  // reachable by STUDENT/GUARDIAN tokens. Those roles have their own
  // ownership-scoped GET /api/portal/student/:id/notices instead.
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        audience: z.string().optional(), is_published: z.string().optional(), search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const where = {
      ...(query.audience && { audience: query.audience as never }),
      ...(query.is_published !== undefined && { is_published: query.is_published === "true" }),
      ...(query.search && { title: { contains: query.search, mode: "insensitive" as const } }),
    };
    const [notices, total] = await Promise.all([
      prisma.notice.findMany({
        where,
        orderBy: [{ is_pinned: "desc" }, { created_at: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notice.count({ where }),
    ]);
    res.json({ success: true, data: notices, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

noticesRouter.post(
  "/",
  authorize(WEBSITE_CONTENT_ROLES),
  documentUpload.single("attachment"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const body = noticeSchema.omit({ attachment_url: true }).parse({
      ...req.body,
      is_pinned: req.body.is_pinned === "true" || req.body.is_pinned === true,
      is_public_website: req.body.is_public_website === "true" || req.body.is_public_website === true,
      send_sms: req.body.send_sms === "true" || req.body.send_sms === true,
      include_signature: req.body.include_signature === "true" || req.body.include_signature === true,
    });
    body.body = sanitizeHtml(body.body);
    const bodyIsEmpty = !body.body || body.body === "<p></p>";
    if (bodyIsEmpty && !req.file) throw badRequest("Provide either notice content or an uploaded document");

    let attachment_url: string | undefined;
    if (req.file) attachment_url = (await uploadBuffer("notices", req.file.originalname, req.file.buffer, req.file.mimetype)).url;

    const notice = await prisma.notice.create({ data: { ...body, attachment_url, created_by_id: req.user!.sub } });
    res.status(201).json({ success: true, data: notice });
  }),
);

noticesRouter.put(
  "/:id",
  authorize(WEBSITE_CONTENT_ROLES),
  documentUpload.single("attachment"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const existing = await prisma.notice.findUnique({ where: { id: reqParam(req, "id") } });
    if (!existing) throw notFound("Notice not found");

    const body = noticeSchema.omit({ attachment_url: true }).partial().parse({
      ...req.body,
      ...(req.body.is_pinned !== undefined && { is_pinned: req.body.is_pinned === "true" || req.body.is_pinned === true }),
      ...(req.body.is_public_website !== undefined && { is_public_website: req.body.is_public_website === "true" || req.body.is_public_website === true }),
      ...(req.body.send_sms !== undefined && { send_sms: req.body.send_sms === "true" || req.body.send_sms === true }),
      ...(req.body.include_signature !== undefined && { include_signature: req.body.include_signature === "true" || req.body.include_signature === true }),
    });
    if (body.body) body.body = sanitizeHtml(body.body);

    let attachment_url: string | undefined;
    if (req.file) attachment_url = (await uploadBuffer("notices", req.file.originalname, req.file.buffer, req.file.mimetype)).url;

    const resultingBody = body.body !== undefined ? body.body : existing.body;
    const resultingAttachment = attachment_url ?? existing.attachment_url;
    const bodyIsEmpty = !resultingBody || resultingBody === "<p></p>";
    if (bodyIsEmpty && !resultingAttachment) throw badRequest("Provide either notice content or an uploaded document");

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

    const recipients = await audienceRecipients(notice.audience);
    await Promise.all(
      recipients
        .filter((r): r is typeof r & { user_id: string } => !!r.user_id)
        .map((r) =>
          createInAppNotification({
            userId: r.user_id,
            type: "NOTICE_PUBLISHED",
            title: notice.title,
            // Deep-link to the specific notice for portal recipients (a real
            // page, apps/portal/src/app/notices/[id]/page.tsx). Staff have no
            // equivalent single-notice page today, only the admin list — link
            // there instead of guaranteed-404ing on a portal-only route.
            link: r._origin === "portal" ? `/notices/${notice.id}` : "/website/notices",
          }),
        ),
    );

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

    const recipients = await audienceRecipients(body.override_audience ?? notice.audience);
    const result = await sendNotification({
      trigger: "NOTICE",
      recipients,
      template_data: { title: notice.title, body: notice.body.slice(0, 100) },
    });
    await prisma.notice.update({ where: { id }, data: { sms_sent_at: new Date() } });

    res.json({ success: true, data: result });
  }),
);
