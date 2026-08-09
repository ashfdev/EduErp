import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { prisma } from "../lib/prisma";
import { sendNotification } from "../services/notification.service";
import { unauthorized } from "../lib/errors";
import { resolveDeviceServiceSecret } from "../lib/env";
import { internalServiceLimiter } from "../middleware/rate-limit";

const DEVICE_SERVICE_SECRET = resolveDeviceServiceSecret();

// Constant-time comparison for a security-boundary secret check (audit
// finding, 2026-08-09) — a plain `!==` string compare leaks timing
// information proportional to how many leading characters match, a
// theoretical (if hard to exploit over real network jitter) side channel.
// Both buffers must be equal length for timingSafeEqual to run at all, so
// length is checked separately first (that comparison alone is safe to
// leak, since it's not the actual secret being probed for).
function secretsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const internalRouter = Router();
internalRouter.use(internalServiceLimiter);

// Called by services/device whenever a punch resolves to a real attendance
// event, so a live UI widget (e.g. an admin dashboard) can update instantly.
// Shared-secret authenticated rather than JWT — this is service-to-service,
// not a logged-in user. No Socket.io server exists yet in this codebase
// (a documented gap since Phase 5), so live-widget wiring is still future
// work; as of Phase 17 this at least fires the LATE notification trigger for
// students (staff have no shift model, so LATE never applies to them — see
// Phase 16's punch.processor.ts).
internalRouter.post(
  "/attendance/biometric-event",
  asyncHandler(async (req, res) => {
    if (!secretsMatch(req.headers["x-device-service-secret"], DEVICE_SERVICE_SECRET)) {
      throw unauthorized("Invalid internal secret");
    }
    const body = z
      .object({
        person_id: z.string(),
        person_type: z.enum(["STUDENT", "STAFF"]),
        status: z.string(),
        time: z.coerce.date(),
        shift_id: z.string().nullable().optional(),
        event_type: z.enum(["ENTRY", "EXIT"]).nullable().optional(),
      })
      .parse(req.body);

    req.log.info({ event: "biometric-attendance", ...body }, "biometric attendance event received");

    if (body.person_type === "STUDENT") {
      const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });

      if (body.status === "LATE" && rules?.sms_on_late) {
        const student = await prisma.student.findUnique({
          where: { id: body.person_id },
          select: { id: true, name_en: true, father_phone: true, guardian: { select: { user_id: true, email: true } } },
        });
        if (student) {
          await sendNotification({
            trigger: "LATE",
            recipients: [{ name: student.name_en, phone: student.father_phone, email: student.guardian?.email, user_id: student.guardian?.user_id, person_id: student.id }],
            template_data: { student_name: student.name_en, time: body.time.toLocaleTimeString() },
          });
        }
      }

      // Guardian entry/exit SMS (2026-08-09 audit finding) — previously only
      // the LATE-specific branch above existed; a student's ordinary
      // arrival/departure fired no notification of any kind. Gated behind
      // the same "off by default" convention as sms_on_late.
      if (body.event_type && rules?.sms_on_entry_exit) {
        // ENTRY only ever fires once per day by construction (see
        // punch.processor.ts's classification) — but EXIT can legitimately
        // re-derive on a 3rd/4th/etc. punch as "the new latest known
        // whereabouts," which would otherwise resend a DEPARTURE SMS every
        // time. Dedup by checking whether one was already logged today for
        // this student, rather than adding a new schema field just to track
        // a single boolean flag.
        const trigger = body.event_type === "ENTRY" ? "STUDENT_ARRIVAL" : "STUDENT_DEPARTURE";
        const dayStart = new Date(body.time.getFullYear(), body.time.getMonth(), body.time.getDate());
        const alreadySent =
          body.event_type === "EXIT" &&
          (await prisma.notificationLog.findFirst({
            where: { trigger: "STUDENT_DEPARTURE", person_id: body.person_id, created_at: { gte: dayStart } },
          }));

        if (!alreadySent) {
          const student = await prisma.student.findUnique({
            where: { id: body.person_id },
            select: { id: true, name_en: true, father_phone: true, guardian: { select: { user_id: true, email: true } } },
          });
          if (student) {
            await sendNotification({
              trigger,
              recipients: [{ name: student.name_en, phone: student.father_phone, email: student.guardian?.email, user_id: student.guardian?.user_id, person_id: student.id }],
              template_data: { student_name: student.name_en, time: body.time.toLocaleTimeString() },
            });
          }
        }
      }
    }

    res.json({ success: true, data: { received: true } });
  }),
);
