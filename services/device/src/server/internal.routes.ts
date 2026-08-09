import express, { Router, type Router as ExpressRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { enqueueCommand } from "../lib/command-queue";
import { reconcileUnprocessedPunches } from "../processor/reconciliation";

// Same fail-loud-in-production pattern as server/api/src/lib/env.ts's
// resolveDeviceServiceSecret() (security audit, 2026-08-09) — this service
// has no shared env-validation module of its own, so the check is inlined
// here rather than introducing one for a single secret.
function resolveDeviceServiceSecret(): string {
  if (process.env.DEVICE_SERVICE_SECRET) return process.env.DEVICE_SERVICE_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DEVICE_SERVICE_SECRET must be set in production — refusing to use a dev-only fallback for service-to-service auth");
  }
  return "dev-only-device-secret";
}
const DEVICE_SERVICE_SECRET = resolveDeviceServiceSecret();

// Constant-time comparison (audit finding) — see server/api/src/routes/
// internal.ts's identical secretsMatch() for the full reasoning.
function secretsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const internalRouter: ExpressRouter = Router();
internalRouter.use(express.json());

internalRouter.use((req, res, next) => {
  if (!secretsMatch(req.headers["x-device-service-secret"], DEVICE_SERVICE_SECRET)) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid internal secret" } });
  }
  next();
});

// Called by the core API's POST /api/devices/:id/sync-now.
internalRouter.post("/reconcile", async (_req, res) => {
  const result = await reconcileUnprocessedPunches();
  res.json({ success: true, data: result });
});

// Called by the core API's POST /api/devices/:id/sync-users and /enroll-user.
internalRouter.post("/command", (req, res) => {
  const { serial_number, command } = req.body as { serial_number?: string; command?: string };
  if (!serial_number || !command) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "serial_number and command are required" } });
  }
  const id = enqueueCommand(serial_number, command);
  res.json({ success: true, data: { queued: id } });
});
