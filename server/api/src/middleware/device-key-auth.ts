import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "./async-handler";

// Phase 37 — a GPS tracker unit can't hold a staff JWT, so vehicle-location
// ingestion authenticates via a per-vehicle secret instead of authenticate()
// + authorize(). Attaches the resolved vehicle to req.vehicle on success.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      vehicle?: { id: string; vehicle_no: string };
    }
  }
}

export const deviceKeyAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers["x-device-key"];
  if (typeof key !== "string" || !key) {
    res.status(401).json({ success: false, error: { code: "DEVICE_KEY_MISSING", message: "x-device-key header is required" } });
    return;
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { device_api_key: key }, select: { id: true, vehicle_no: true, is_active: true } });
  if (!vehicle || !vehicle.is_active) {
    res.status(401).json({ success: false, error: { code: "DEVICE_KEY_INVALID", message: "Invalid device key" } });
    return;
  }

  req.vehicle = { id: vehicle.id, vehicle_no: vehicle.vehicle_no };
  next();
});
