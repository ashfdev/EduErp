import axios from "axios";

function normalizeBdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "88" + digits;
  return "88" + digits;
}

// BulkSMSBD (bulksmsbd.net) adapter -- matches the client's own currently-
// working integration exactly (POST with a form-encoded body, not a GET
// with query params -- axios JSON-encodes a plain object by default, so
// URLSearchParams is what actually produces
// application/x-www-form-urlencoded, mirroring Python's
// requests.post(url, data=payload)). Field set is deliberately just
// api_key/senderid/number/message -- no extra `type` param -- to match the
// confirmed-working reference exactly rather than a guessed/documented
// shape. Genuinely wired and ready the moment real credentials are entered
// in Settings -> SMS Gateway.
export async function sendViaBulkSmsBd(
  phone: string,
  message: string,
  credentials: { api_key: string; sender_id?: string; api_url?: string },
): Promise<{ sent: boolean; providerResponse?: unknown }> {
  const apiUrl = credentials.api_url ?? "https://bulksmsbd.net/api/smsapi";
  const body = new URLSearchParams({
    api_key: credentials.api_key,
    senderid: credentials.sender_id ?? "",
    number: normalizeBdPhone(phone),
    message,
  });
  const res = await axios.post(apiUrl, body, { timeout: 10000 });
  // BulkSMSBD returns { response_code, success_message } — 202 is their
  // documented "submitted successfully" code. Not yet cross-checked against
  // a real account's actual response body (only the request shape was
  // confirmed against a known-working reference) -- if a real send reports
  // sent:false despite actually going through, this check is the first
  // place to compare against the real response_code value.
  const responseCode = res.data?.response_code;
  return { sent: responseCode === 202 || responseCode === "202", providerResponse: res.data };
}
