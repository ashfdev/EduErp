import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { BULK_SMS_ROLES } from "../../lib/roles";
import { bulkSmsSchema } from "@education-erp/validators";
import { sendSms } from "../../services/sms.service";
import { logAudit } from "../../lib/audit-log";

export const bulkSmsRouter = Router();
bulkSmsRouter.use(authenticate, authorize(BULK_SMS_ROLES));

interface Recipient {
  name: string;
  phone: string;
}

// Shared by both the preview and send routes so the count shown to the
// admin before sending always matches who actually gets messaged.
async function resolveRecipients(body: {
  audience: "STUDENTS" | "GUARDIANS" | "STAFF" | "ALL";
  class_id?: string;
  section_id?: string;
  staff_role?: string;
  recipient_ids?: string[];
}): Promise<Recipient[]> {
  if (body.recipient_ids?.length) {
    const [guardians, staff] = await Promise.all([
      prisma.guardian.findMany({ where: { id: { in: body.recipient_ids } }, select: { name_en: true, phone: true } }),
      prisma.staff.findMany({ where: { id: { in: body.recipient_ids }, phone: { not: null } }, select: { name_en: true, phone: true } }),
    ]);
    const recipients = [...guardians.map((g) => ({ name: g.name_en, phone: g.phone })), ...staff.map((s) => ({ name: s.name_en, phone: s.phone! }))];
    return dedupeByPhone(recipients);
  }

  const studentFilter = {
    deleted_at: null,
    ...(body.class_id && { current_class_id: body.class_id }),
    ...(body.section_id && { current_section_id: body.section_id }),
  };

  const recipients: Recipient[] = [];

  if (body.audience === "STUDENTS" || body.audience === "ALL") {
    // Matches the existing website-notice audienceRecipients() precedent —
    // students are reached via the guardian's phone (father_phone), not a
    // student's own phone field, which is usually unset.
    const students = await prisma.student.findMany({
      where: { ...studentFilter, father_phone: { not: null } },
      select: { name_en: true, father_phone: true },
    });
    recipients.push(...students.map((s) => ({ name: s.name_en, phone: s.father_phone! })));
  }

  if (body.audience === "GUARDIANS" || body.audience === "ALL") {
    const guardians = await prisma.guardian.findMany({
      where: body.class_id || body.section_id ? { students: { some: studentFilter } } : {},
      select: { name_en: true, phone: true },
    });
    recipients.push(...guardians.map((g) => ({ name: g.name_en, phone: g.phone })));
  }

  if (body.audience === "STAFF" || body.audience === "ALL") {
    const staff = await prisma.staff.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        phone: { not: null },
        ...(body.staff_role && { user: { role: body.staff_role as never } }),
      },
      select: { name_en: true, phone: true },
    });
    recipients.push(...staff.map((s) => ({ name: s.name_en, phone: s.phone! })));
  }

  return dedupeByPhone(recipients);
}

function dedupeByPhone(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });
}

bulkSmsRouter.post(
  "/bulk-sms/preview",
  asyncHandler(async (req, res) => {
    const body = bulkSmsSchema.parse(req.body);
    const recipients = await resolveRecipients(body);
    res.json({ success: true, data: { count: recipients.length, sample: recipients.slice(0, 10).map((r) => r.name) } });
  }),
);

bulkSmsRouter.post(
  "/bulk-sms",
  asyncHandler(async (req, res) => {
    const body = bulkSmsSchema.parse(req.body);
    const recipients = await resolveRecipients(body);

    // Sequential, not Promise.all — each call already queues onto smsQueue
    // (fire-and-forget from this route's perspective) so this just needs to
    // avoid hammering the DB/Redis with hundreds of simultaneous writes.
    let queued = 0;
    for (const recipient of recipients) {
      await sendSms(recipient.phone, body.message);
      queued++;
    }

    await logAudit("BULK_SMS_SEND", {
      userId: req.user!.sub,
      targetType: "BulkSms",
      targetId: body.audience,
      metadata: { audience: body.audience, class_id: body.class_id, section_id: body.section_id, recipient_count: queued },
      req,
    });

    res.json({ success: true, data: { queued } });
  }),
);
