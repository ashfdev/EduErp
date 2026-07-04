import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/redis-connection";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendEmailViaSmtp, sendEmailMock } from "../providers/email/nodemailer.provider";

interface EmailJobData {
  log_id: string;
  to: string;
  subject: string;
  body: string;
}

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(
    "notification-email",
    async (job: Job<EmailJobData>) => {
      const { log_id, to, subject, body } = job.data;
      const useReal = !!process.env.SMTP_HOST;
      const result = useReal ? await sendEmailViaSmtp(to, subject, body) : await sendEmailMock(to, subject, body);
      if (!result.sent) throw new Error("Email provider reported failure");

      await prisma.notificationLog.update({ where: { id: log_id }, data: { status: "SENT", sent_at: new Date() } });
      return result;
    },
    { connection: redisConnection },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      prisma.notificationLog
        .update({ where: { id: job.data.log_id }, data: { status: "FAILED", error_message: err.message } })
        .catch((updateErr) => logger.error({ updateErr }, "failed to record email failure"));
      logger.error({ jobId: job.id, err }, "Email job permanently failed");
    }
  });

  logger.info("Email worker started");
  return worker;
}
