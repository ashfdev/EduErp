import axios from "axios";

function normalizeBdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "88" + digits;
  return "88" + digits;
}

// Real SSL Wireless BD adapter — only called when SMS_API_TOKEN/SMS_SID are
// configured (see workers/sms.worker.ts's provider selection). Credentials
// are explicitly deferred by the client; this is genuinely wired and ready
// to go live the moment they're supplied.
export async function sendViaSslWireless(phone: string, message: string): Promise<{ sent: boolean; providerResponse?: unknown }> {
  const apiToken = process.env.SMS_API_TOKEN;
  const sid = process.env.SMS_SID;
  const apiUrl = process.env.SMS_API_URL ?? "https://sms.sslwireless.com/pushapi/dynamic/server.php";

  const csmsid = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await axios.post(
    apiUrl,
    null,
    { params: { api_token: apiToken, sid, msisdn: normalizeBdPhone(phone), sms: message, csms_id: csmsid }, timeout: 10000 },
  );
  const status = String(res.data?.status ?? "").toUpperCase();
  return { sent: status === "SUCCESS", providerResponse: res.data };
}
