// Same fix as server/api/src/index.ts (2026-08-10 audit finding) — explicit
// timezone pin, not a shared assumption about the host's own clock.
process.env.TZ = "Asia/Dhaka";

import "dotenv/config";
import express from "express";
import { startSmsWorker } from "./workers/sms.worker";
import { startEmailWorker } from "./workers/email.worker";
import { startPushWorker } from "./workers/push.worker";
import { logger } from "./lib/logger";

const PORT = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 4600);

const app = express();
app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

app.listen(PORT, () => {
  logger.info(`Notification service listening on port ${PORT}`);
  startSmsWorker();
  startEmailWorker();
  startPushWorker();
});
