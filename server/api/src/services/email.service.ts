import { logger } from "../lib/logger";

// Minimal placeholder — replaced by the real Nodemailer/SMTP adapter in
// Phase 18 (Notification Service). Logs instead of sending until SMTP_HOST
// is configured, mirroring sms.service.ts's stub pattern.
export async function sendEmail(to: string, subject: string, body: string): Promise<{ sent: boolean }> {
  if (!process.env.SMTP_HOST) {
    logger.info({ to, subject, body }, "[email stub] would send email (SMTP_HOST not configured)");
    return { sent: false };
  }
  logger.info({ to, subject }, "[email stub] SMTP_HOST configured but real dispatch not yet implemented");
  return { sent: false };
}
