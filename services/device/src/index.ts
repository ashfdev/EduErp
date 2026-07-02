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
