import { logger } from "../lib/logger";

// Minimal placeholder — replaced by the real SSL Wireless BD adapter + BullMQ
// queue worker in Phase 18 (Notification Service). Logs instead of sending
// until SMS_API_TOKEN/SMS_SID are configured, mirroring the CASH-gateway
// pattern of "genuinely working locally, real integration pending credentials".
export async function sendSms(phone: string, message: string): Promise<{ sent: boolean }> {
  if (!process.env.SMS_API_TOKEN) {
    logger.info({ phone, message }, "[sms stub] would send SMS (SMS_API_TOKEN not configured)");
    return { sent: false };
  }
  // Real SSL Wireless BD dispatch lands in Phase 18.
  logger.info({ phone, message }, "[sms stub] SMS_API_TOKEN configured but real dispatch not yet implemented");
  return { sent: false };
}
