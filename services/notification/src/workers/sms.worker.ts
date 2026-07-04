import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/redis-connection";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendViaSslWireless } from "../providers/sms/sslwireless.provider";
import { sendViaMock } from "../providers/sms/mock.provider";

interface SmsJobData {
  log_id: string;
  phone: string;
  message: string;
}

export function startSmsWorker() {
  const worker = new Worker<SmsJobData>(
    "notification-sms",
    async (job: Job<SmsJobData>) => {
      const { log_id, phone, message } = job.data;
      const useReal = !!(process.env.SMS_API_TOKEN && process.env.SMS_SID);
      const result = useReal ? await sendViaSslWireless(phone, message) : await sendViaMock(phone, message);
      if (!result.sent) throw new Error("SMS provider reported failure");

      await prisma.notificationLog.update({ where: { id: log_id }, data: { status: "SENT", sent_at: new Date() } });
      return result;
    },
    { connection: redisConnection },
  );

  // Only write the terminal FAILED status once BullMQ's own retries
  // (attempts: 3, exponential backoff — see server/api's DEFAULT_JOB_OPTS)
  // are exhausted, not on every individual attempt.
  worker.on("failed", (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      prisma.notificationLog
        .update({ where: { id: job.data.log_id }, data: { status: "FAILED", error_message: err.message } })
        .catch((updateErr) => logger.error({ updateErr }, "failed to record SMS failure"));
      logger.error({ jobId: job.id, err }, "SMS job permanently failed");
    }
  });

  logger.info("SMS worker started");
  return worker;
}
