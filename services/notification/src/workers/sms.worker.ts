import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/redis-connection";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { resolveActiveSmsGateway } from "../lib/sms-gateway-config";
import { sendViaSslWireless } from "../providers/sms/sslwireless.provider";
import { sendViaBulkSmsBd } from "../providers/sms/bulksmsbd.provider";
import { sendViaGenericProvider } from "../providers/sms/generic.provider";
import { sendViaMock } from "../providers/sms/mock.provider";

interface SmsJobData {
  log_id: string;
  phone: string;
  message: string;
}

// Resolved fresh on every job (not once at worker startup) so an admin
// updating credentials in Settings -> SMS Gateway takes effect on the very
// next send, no restart needed. DB-stored config (Settings -> SMS Gateway)
// wins when a provider is active there; otherwise falls back to the
// original SMS_API_TOKEN/SMS_SID env-var path unchanged, so an install
// that's never touched the new Settings page behaves exactly as before.
async function sendSmsViaResolvedProvider(phone: string, message: string): Promise<{ sent: boolean; providerResponse?: unknown }> {
  const active = await resolveActiveSmsGateway();
  if (active) {
    switch (active.provider) {
      case "SSL_WIRELESS":
        return sendViaSslWireless(phone, message, active);
      case "BULKSMSBD":
        return sendViaBulkSmsBd(phone, message, active);
      case "OTHER":
        if (!active.api_url) throw new Error("Custom SMS provider is active but has no API URL configured");
        return sendViaGenericProvider(phone, message, { ...active, api_url: active.api_url });
    }
  }
  const useReal = !!(process.env.SMS_API_TOKEN && process.env.SMS_SID);
  return useReal ? sendViaSslWireless(phone, message) : sendViaMock(phone, message);
}

export function startSmsWorker() {
  const worker = new Worker<SmsJobData>(
    "notification-sms",
    async (job: Job<SmsJobData>) => {
      const { log_id, phone, message } = job.data;
      const result = await sendSmsViaResolvedProvider(phone, message);
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
