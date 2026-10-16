import { logger } from "../../lib/logger";

// Dev/testing mock — used whenever SMS_API_TOKEN/SMS_SID aren't configured
// (the real SMS gateway account is explicitly deferred by the client), so
// the whole queue → worker → NotificationLog pipeline is provably correct
// end-to-end without needing real credentials.
export async function sendViaMock(phone: string, message: string): Promise<{ sent: boolean }> {
  // Production logs never get the text: it can hold an OTP or a password.
  const detail = process.env.NODE_ENV === "production" ? { chars: message.length } : { message };
  logger.info({ phone, ...detail }, "[sms mock provider] pretending to send");
  return { sent: true };
}
