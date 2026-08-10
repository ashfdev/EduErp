process.env.TZ = "Asia/Dhaka";

import "dotenv/config";
import { logger } from "./lib/logger";
import { registerExamReminderJob } from "./jobs/exam-reminder.job";
import { registerMonthlyFeeGenerationJob } from "./jobs/monthly-fee-generation.job";
import { registerFeeReconciliationJob } from "./jobs/fee-reconciliation.job";
import { registerDocumentBatchJob } from "./jobs/document-batch.job";

async function startWorker() {
  logger.info("Starting background worker process...");
  
  await registerExamReminderJob();
  await registerMonthlyFeeGenerationJob();
  await registerFeeReconciliationJob();
  await registerDocumentBatchJob();

  logger.info("Worker process is listening for jobs.");
}

startWorker().catch((err) => {
  logger.error({ err }, "Failed to start worker process");
  process.exitCode = 1;
});
