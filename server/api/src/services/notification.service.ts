import type { NotificationTrigger } from "@education-erp/db";
import { prisma } from "../lib/prisma";
import { smsQueue, emailQueue, pushQueue, DEFAULT_JOB_OPTS } from "../lib/queues";
import { logger } from "../lib/logger";

export interface NotificationRecipient {
  name: string;
  phone?: string | null;
  email?: string | null;
  user_id?: string | null;
  person_id?: string | null;
  lang?: "BN" | "EN";
}

const TRIGGER_EMAIL_SUBJECT: Record<NotificationTrigger, string> = {
  ABSENCE: "Attendance Notice",
  LATE: "Late Arrival Notice",
  FEE_DUE: "Fee Due Reminder",
  RESULT_PUBLISHED: "Result Published",
  NOTICE: "Notice",
  ADMISSION_CONFIRM: "Admission Confirmed",
};

function interpolate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => data[key] ?? "");
}

// Config-driven, multi-channel, trigger-based send. Loads NotificationConfig
// for the trigger, skips disabled channels, compiles the BN/EN template with
// template_data, and fans out to whichever channels each recipient has the
// contact info for (SMS needs phone, EMAIL needs email, PUSH needs user_id).
// Every attempt gets a NotificationLog row up front (status=QUEUED) that the
// corresponding worker in services/notification updates to SENT/FAILED —
// this is what makes /settings/notifications/logs a real audit trail instead
// of just a fire-and-forget queue.
export async function sendNotification(params: {
  trigger: NotificationTrigger;
  recipients: NotificationRecipient[];
  template_data: Record<string, string>;
}): Promise<{ queued: number; skipped: number }> {
  const configs = await prisma.notificationConfig.findMany({ where: { trigger: params.trigger, is_enabled: true } });
  let queued = 0;
  let skipped = 0;

  for (const recipient of params.recipients) {
    for (const config of configs) {
      const template = recipient.lang === "EN" ? config.template_en : config.template_bn;
      const message = interpolate(template, params.template_data);

      try {
        if (config.channel === "SMS") {
          if (!recipient.phone) {
            skipped++;
            continue;
          }
          const log = await prisma.notificationLog.create({
            data: { trigger: params.trigger, channel: "SMS", recipient: recipient.phone, person_id: recipient.person_id, status: "QUEUED", message },
          });
          await smsQueue.add("send", { log_id: log.id, phone: recipient.phone, message }, DEFAULT_JOB_OPTS);
          queued++;
        } else if (config.channel === "EMAIL") {
          if (!recipient.email) {
            skipped++;
            continue;
          }
          const log = await prisma.notificationLog.create({
            data: { trigger: params.trigger, channel: "EMAIL", recipient: recipient.email, person_id: recipient.person_id, status: "QUEUED", message },
          });
          await emailQueue.add(
            "send",
            { log_id: log.id, to: recipient.email, subject: TRIGGER_EMAIL_SUBJECT[params.trigger], body: message },
            DEFAULT_JOB_OPTS,
          );
          queued++;
        } else if (config.channel === "PUSH") {
          if (!recipient.user_id) {
            skipped++;
            continue;
          }
          const log = await prisma.notificationLog.create({
            data: { trigger: params.trigger, channel: "PUSH", recipient: recipient.user_id, person_id: recipient.person_id, status: "QUEUED", message },
          });
          await pushQueue.add(
            "send",
            { log_id: log.id, user_id: recipient.user_id, title: TRIGGER_EMAIL_SUBJECT[params.trigger], body: message },
            DEFAULT_JOB_OPTS,
          );
          queued++;
        }
      } catch (err) {
        logger.error({ err, trigger: params.trigger, channel: config.channel }, "failed to enqueue notification");
        skipped++;
      }
    }
  }

  return { queued, skipped };
}
