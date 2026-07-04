import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../../lib/logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// Real SMTP send — only called when SMTP_HOST is configured (see
// workers/email.worker.ts's provider selection). Falls back to a logging
// mock in dev, mirroring sms provider's mock/real split.
export async function sendEmailViaSmtp(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  await getTransporter().sendMail({ from: process.env.SMTP_FROM ?? "noreply@institution.edu.bd", to, subject, html });
  return { sent: true };
}

export async function sendEmailMock(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  logger.info({ to, subject, html }, "[email mock provider] SMTP_HOST not configured, pretending to send");
  return { sent: true };
}
