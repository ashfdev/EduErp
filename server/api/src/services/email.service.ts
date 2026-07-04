import { prisma } from "../lib/prisma";
import { emailQueue, DEFAULT_JOB_OPTS } from "../lib/queues";
import { logger } from "../lib/logger";

// Plain, non-templated email send. As of Phase 17 this enqueues onto BullMQ
// instead of calling Nodemailer inline — see sms.service.ts for the same
// reasoning (decoupled, never blocks the request, real delivery + retry
// happens in services/notification's email.worker.ts).
export async function sendEmail(to: string, subject: string, body: string): Promise<{ sent: boolean }> {
  try {
    const log = await prisma.notificationLog.create({ data: { channel: "EMAIL", recipient: to, status: "QUEUED", message: body } });
    await emailQueue.add("send", { log_id: log.id, to, subject, body }, DEFAULT_JOB_OPTS);
    return { sent: true };
  } catch (err) {
    logger.error({ err, to }, "failed to enqueue email");
    return { sent: false };
  }
}
