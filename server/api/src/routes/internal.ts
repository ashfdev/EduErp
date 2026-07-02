import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { unauthorized } from "../lib/errors";

const DEVICE_SERVICE_SECRET = process.env.DEVICE_SERVICE_SECRET ?? "dev-only-device-secret";

export const internalRouter = Router();

// Called by services/device whenever a punch resolves to a real attendance
// event, so a live UI widget (e.g. an admin dashboard) can update instantly.
// Shared-secret authenticated rather than JWT — this is service-to-service,
// not a logged-in user. No Socket.io server exists yet in this codebase
// (a documented gap since Phase 5), so this currently just logs the event;
// wiring it to a real live-attendance widget is future work once Socket.io
// is actually stood up.
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
    res.json({ success: true, data: { received: true } });
  }),
);
