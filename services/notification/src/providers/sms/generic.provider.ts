import axios from "axios";

// Best-effort adapter for the "Other / Custom" provider option in Settings
// -> SMS Gateway. There is no single standard shape across every BD SMS
// reseller, so this covers the common-enough pattern (a simple GET with
// api_key/senderid/number/message query params) rather than attempting to
// support every possible API shape -- a provider with a genuinely different
// request format (POST body, different field names, custom auth headers)
// needs its own small adapter file added alongside bulksmsbd.provider.ts,
// the same way BulkSMSBD itself was added. Flagged plainly in the Settings
// page copy, not silently assumed to work for anything.
export async function sendViaGenericProvider(
  phone: string,
  message: string,
  credentials: { api_key: string; api_secret?: string; sender_id?: string; api_url: string },
): Promise<{ sent: boolean; providerResponse?: unknown }> {
  const res = await axios.get(credentials.api_url, {
    params: {
      api_key: credentials.api_key,
      ...(credentials.api_secret && { api_secret: credentials.api_secret }),
      senderid: credentials.sender_id,
      number: phone.replace(/\D/g, ""),
      message,
    },
    timeout: 10000,
  });
  // No universal success signal across arbitrary providers -- a 2xx HTTP
  // response (which axios already guarantees by not throwing) is treated
  // as sent. A provider with its own explicit success/failure body needs
  // its own dedicated adapter for a real check, same note as above.
  return { sent: true, providerResponse: res.data };
}
