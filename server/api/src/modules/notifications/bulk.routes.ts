import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { BULK_SMS_ROLES } from "../../lib/roles";
import type { z } from "zod";
import { bulkSmsSchema } from "@education-erp/validators";
import { smsQueue, DEFAULT_JOB_OPTS } from "../../lib/queues";
import { logAudit } from "../../lib/audit-log";

export const bulkSmsRouter = Router();
bulkSmsRouter.use(authenticate, authorize(BULK_SMS_ROLES));

interface Recipient {
  name: string;
  phone: string;
}

// Shared by both the preview and send routes so the count shown to the
// admin before sending always matches who actually gets messaged.
// Typed from the real schema (not a hand-written interface) so a change to
// bulkSmsSchema — e.g. staff_role's allowed values — can't silently drift
// out of sync with what this function actually accepts.
async function resolveRecipients(body: z.infer<typeof bulkSmsSchema>): Promise<Recipient[]> {
  if (body.recipient_ids?.length) {
    // recipient_ids may reference Guardian, Staff, or Student ids (a
    // roster-search "select these students" flow resolves to Student ids,
    // not Guardian ids) — resolve all three, not just guardian/staff, or a
    // STUDENTS-scoped override silently returns zero recipients.
    const [guardians, staff, students] = await Promise.all([
      prisma.guardian.findMany({ where: { id: { in: body.recipient_ids } }, select: { name_en: true, phone: true } }),
      prisma.staff.findMany({
        where: { id: { in: body.recipient_ids }, phone: { not: null }, is_active: true, deleted_at: null },
        select: { name_en: true, phone: true },
      }),
      prisma.student.findMany({
        where: { id: { in: body.recipient_ids }, deleted_at: null, father_phone: { not: null } },
        select: { name_en: true, father_phone: true },
      }),
    ]);
    const recipients = [
      ...guardians.map((g) => ({ name: g.name_en, phone: g.phone })),
      ...staff.map((s) => ({ name: s.name_en, phone: s.phone! })),
      ...students.map((s) => ({ name: s.name_en, phone: s.father_phone! })),
    ];
    return dedupeByPhone(recipients);
  }

  const studentFilter = {
    deleted_at: null,
    status: "ACTIVE" as const,
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
        ...(body.staff_role && { user: { role: body.staff_role } }),
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

    // Batched, not one-recipient-at-a-time — a fully sequential loop (one
    // awaited DB insert + one awaited Redis push per recipient) held the
    // HTTP response open for the whole send for a large audience (a
    // few-thousand-guardian "ALL" broadcast could take 60-100+ seconds,
    // risking a gateway timeout). Each chunk still creates its
    // NotificationLog rows in parallel and pushes the whole chunk to
    // smsQueue in one addBulk call, bounded to CHUNK_SIZE so this doesn't
    // open thousands of concurrent DB connections at once.
    const CHUNK_SIZE = 200;
    let queued = 0;
    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      // Each recipient's own phone travels with its created log row (via
      // .then, not a separate parallel-array index) so there's no risk of
      // a log/phone pairing drifting apart if ordering assumptions change.
      const created = await Promise.all(
        chunk.map((r) =>
          prisma.notificationLog
            .create({ data: { channel: "SMS", recipient: r.phone, status: "QUEUED", message: body.message } })
            .then((log) => ({ log, phone: r.phone })),
        ),
      );
      await smsQueue.addBulk(
        created.map(({ log, phone }) => ({ name: "send", data: { log_id: log.id, phone, message: body.message }, opts: DEFAULT_JOB_OPTS })),
      );
      queued += created.length;
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
