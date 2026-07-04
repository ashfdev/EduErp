import webpush from "web-push";
import { logger } from "../../lib/logger";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@institution.edu.bd", publicKey, privateKey);
  configured = true;
  return true;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Real Web Push send. On a 410 Gone (subscription expired/revoked) the
// caller (push.worker.ts) is expected to delete the PushSubscription row —
// this function just surfaces the status code so it can decide.
export async function sendPush(subscription: WebPushSubscription, payload: { title: string; body: string }): Promise<{ sent: boolean; statusCode?: number; gone?: boolean }> {
  if (!ensureConfigured()) {
    logger.info({ endpoint: subscription.endpoint, payload }, "[push mock] VAPID keys not configured, pretending to send");
    return { sent: true };
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { sent: true };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    return { sent: false, statusCode, gone: statusCode === 404 || statusCode === 410 };
  }
}
