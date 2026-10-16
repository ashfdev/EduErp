import { prisma } from "../lib/prisma";
import { smsQueue, DEFAULT_JOB_OPTS } from "../lib/queues";
import { logger } from "../lib/logger";

// Plain, non-templated SMS send (OTP, password reset, receipts — anything
// outside the six configurable NotificationTrigger values). As of Phase 17
// this enqueues onto BullMQ and returns immediately instead of calling the
// SSL Wireless provider inline, so a slow/down SMS gateway never blocks the
// request. Actual delivery + retry happens in services/notification's
// sms.worker.ts, which writes the final SENT/FAILED status back onto the
// NotificationLog row created here. "sent: true" now means "queued
// successfully", not "gateway confirmed delivery" — callers only ever
// surfaced this as an informational response field, never branched on it.
//
// For a message that carries a secret (an OTP), pass `logMessage`: that
// masked text is what NotificationLog keeps (staff can browse those logs),
// and the queued job is deleted from Redis as soon as it finishes.
export async function sendSms(phone: string, message: string, opts: { logMessage?: string } = {}): Promise<{ sent: boolean }> {
  try {
    const log = await prisma.notificationLog.create({ data: { channel: "SMS", recipient: phone, status: "QUEUED", message: opts.logMessage ?? message } });
    const jobOpts = opts.logMessage ? { ...DEFAULT_JOB_OPTS, removeOnComplete: true, removeOnFail: true } : DEFAULT_JOB_OPTS;
    await smsQueue.add("send", { log_id: log.id, phone, message }, jobOpts);
    return { sent: true };
  } catch (err) {
    logger.error({ err, phone }, "failed to enqueue SMS");
    return { sent: false };
  }
}
