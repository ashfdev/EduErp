import axios from "axios";

function normalizeBdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "88" + digits;
  return "88" + digits;
}

// Real SSL Wireless BD adapter — called either with DB-stored credentials
// (Settings -> SMS Gateway) or, when none are active there, with the
// original SMS_API_TOKEN/SMS_SID env vars (see workers/sms.worker.ts's
// provider selection) -- credentials is optional specifically to keep that
// existing env-var-only call path working unchanged.
export async function sendViaSslWireless(
  phone: string,
  message: string,
  credentials?: { api_key: string; sender_id?: string; api_url?: string },
): Promise<{ sent: boolean; providerResponse?: unknown }> {
  const apiToken = credentials?.api_key ?? process.env.SMS_API_TOKEN;
  const sid = credentials?.sender_id ?? process.env.SMS_SID;
  const apiUrl = credentials?.api_url ?? process.env.SMS_API_URL ?? "https://sms.sslwireless.com/pushapi/dynamic/server.php";

  const csmsid = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await axios.post(
    apiUrl,
    null,
    { params: { api_token: apiToken, sid, msisdn: normalizeBdPhone(phone), sms: message, csms_id: csmsid }, timeout: 10000 },
  );
  const status = String(res.data?.status ?? "").toUpperCase();
  return { sent: status === "SUCCESS", providerResponse: res.data };
}
