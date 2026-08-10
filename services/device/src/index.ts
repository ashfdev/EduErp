// Same fix as server/api/src/index.ts (2026-08-10 audit finding) — this
// service also does local-calendar-day math (punch-day boundaries in
// punch.processor.ts), so it needs the same explicit pin, not a shared
// assumption about the host's own clock.
process.env.TZ = "Asia/Dhaka";

import "dotenv/config";
import { createAdmsServer } from "./server/adms.server";
import { startRecurringJobs } from "./jobs/sync.job";
import { logger } from "./lib/logger";

const PORT = Number(process.env.DEVICE_SERVICE_PORT ?? 4500);

const app = createAdmsServer();
app.listen(PORT, () => {
  logger.info(`Device service (ZKTeco ADMS-compatible) listening on port ${PORT}`);
  startRecurringJobs();
});
