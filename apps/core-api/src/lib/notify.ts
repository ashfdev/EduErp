/**
 * Notification stub (PRD §2.1 "Notification Service" — SMS/email/push, BullMQ-queued).
 * No SMS gateway or email provider credentials exist yet (see ROADMAP.md "External
 * accounts" list), so this just logs. Swap the body for a real BullMQ job + SSL
 * Wireless/Mim SMS/SendGrid call once those credentials are available — every caller
 * here already treats this as fire-and-forget, so the call sites won't need to change.
 */
export async function sendOtp(destination: string, code: string, purpose: string): Promise<void> {
  console.log(`[notify:stub] OTP for ${purpose} -> ${destination}: ${code} (would be sent via SMS/email in production)`);
}
