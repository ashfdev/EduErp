import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";
import { resolveGatewayCredentials } from "./gateway-config.helper";

// Real bKash Checkout (Tokenized) API integration needs BKASH_APP_KEY/
// BKASH_APP_SECRET/BKASH_USERNAME/BKASH_PASSWORD (env fallback) or an active
// Settings -> Payment Gateways entry (Plan Fourteen, Phase D2) — deferred per
// standing user decision ("external accounts... will be done later"). The
// adapter shape is real and ready to wire up once sandbox credentials exist.
export const bkashAdapter: PaymentGatewayAdapter = {
  name: "BKASH",
  isConfigured: async () =>
    (
      await resolveGatewayCredentials("BKASH", {
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
        username: process.env.BKASH_USERNAME,
        password: process.env.BKASH_PASSWORD,
      })
    ).configured,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!(await this.isConfigured())) {
      return { status: "FAILED" };
    }
    throw new Error("bKash sandbox integration not yet implemented — credentials are set but the API call itself is a placeholder");
  },
  async verifyCallback() {
    throw new Error("bKash callback verification not yet implemented");
  },
};
