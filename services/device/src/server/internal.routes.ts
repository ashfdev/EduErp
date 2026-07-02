import express, { Router, type Router as ExpressRouter } from "express";
import { enqueueCommand } from "../lib/command-queue";
import { reconcileUnprocessedPunches } from "../processor/reconciliation";

const DEVICE_SERVICE_SECRET = process.env.DEVICE_SERVICE_SECRET ?? "dev-only-device-secret";

export const internalRouter: ExpressRouter = Router();
internalRouter.use(express.json());

internalRouter.use((req, res, next) => {
  if (req.headers["x-device-service-secret"] !== DEVICE_SERVICE_SECRET) {
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
