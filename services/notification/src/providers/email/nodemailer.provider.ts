import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

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

// The "From" display name every outgoing email previously showed nothing
// but a bare noreply@ address for — no institution branding at all, unlike
// PDFs (pdf.service.ts's getInstitutionBranding()) which already pull the
// real name. Queried fresh per send rather than cached: this worker can run
// for weeks between deploys, and a school renaming/rebranding mid-year
// should take effect on the next email, not require a restart. Falls back
// to a generic name only if the institution profile hasn't been set up yet.
async function getFromDisplayName(): Promise<string> {
  const profile = await prisma.institutionProfile.findUnique({ where: { id: "singleton" }, select: { name_en: true } });
  const name = profile?.name_en?.trim();
  return name || "Education ERP";
}

// Real SMTP send — only called when SMTP_HOST is configured (see
// workers/email.worker.ts's provider selection). Falls back to a logging
// mock in dev, mirroring sms provider's mock/real split.
export async function sendEmailViaSmtp(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  const fromAddress = process.env.SMTP_FROM ?? "noreply@institution.edu.bd";
  const fromName = (await getFromDisplayName()).replace(/["\r\n]/g, "");
  await getTransporter().sendMail({ from: `"${fromName}" <${fromAddress}>`, to, subject, html });
  return { sent: true };
}

export async function sendEmailMock(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  logger.info({ to, subject, html }, "[email mock provider] SMTP_HOST not configured, pretending to send");
  return { sent: true };
}
