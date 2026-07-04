import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { prisma } from "../lib/prisma";
import { sendNotification } from "../services/notification.service";
import { unauthorized } from "../lib/errors";

const DEVICE_SERVICE_SECRET = process.env.DEVICE_SERVICE_SECRET ?? "dev-only-device-secret";

export const internalRouter = Router();

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
    if (req.headers["x-device-service-secret"] !== DEVICE_SERVICE_SECRET) {
      throw unauthorized("Invalid internal secret");
    }
    const body = z
      .object({ person_id: z.string(), person_type: z.enum(["STUDENT", "STAFF"]), status: z.string(), time: z.coerce.date(), shift_id: z.string().nullable().optional() })
      .parse(req.body);

    req.log.info({ event: "biometric-attendance", ...body }, "biometric attendance event received");

    if (body.status === "LATE" && body.person_type === "STUDENT") {
      const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
      if (rules?.sms_on_late) {
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
    }

    res.json({ success: true, data: { received: true } });
  }),
);
