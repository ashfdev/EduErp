import { logger } from "../../lib/logger";

// Dev/testing mock — used whenever SMS_API_TOKEN/SMS_SID aren't configured
// (the real SMS gateway account is explicitly deferred by the client), so
// the whole queue → worker → NotificationLog pipeline is provably correct
// end-to-end without needing real credentials.
export async function sendViaMock(phone: string, message: string): Promise<{ sent: boolean }> {
  logger.info({ phone, message }, "[sms mock provider] pretending to send");
  return { sent: true };
}
