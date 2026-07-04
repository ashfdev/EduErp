import { Worker, type Job } from "bullmq";
import { redisConnection } from "../lib/redis-connection";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendPush } from "../providers/push/webpush.provider";

interface PushJobData {
  log_id: string;
  user_id: string;
  title: string;
  body: string;
}

export function startPushWorker() {
  const worker = new Worker<PushJobData>(
    "notification-push",
    async (job: Job<PushJobData>) => {
      const { log_id, user_id, title, body } = job.data;
      const subscriptions = await prisma.pushSubscription.findMany({ where: { user_id } });

      // No subscriptions is a terminal, non-retryable state — not a
      // transient provider failure — so it's SKIPPED, not FAILED.
      if (subscriptions.length === 0) {
        await prisma.notificationLog.update({
          where: { id: log_id },
          data: { status: "SKIPPED", error_message: "No push subscriptions for this user" },
        });
        return { sent: 0 };
      }

      let sent = 0;
      for (const sub of subscriptions) {
        const result = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } }, { title, body });
        if (result.gone) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else if (result.sent) {
          sent++;
        }
      }

      if (sent === 0) throw new Error("Push delivery failed for all subscriptions of this user");
      await prisma.notificationLog.update({ where: { id: log_id }, data: { status: "SENT", sent_at: new Date() } });
      return { sent };
    },
    { connection: redisConnection },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      prisma.notificationLog
        .update({ where: { id: job.data.log_id }, data: { status: "FAILED", error_message: err.message } })
        .catch((updateErr) => logger.error({ updateErr }, "failed to record push failure"));
      logger.error({ jobId: job.id, err }, "Push job permanently failed");
    }
  });

  logger.info("Push worker started");
  return worker;
}
