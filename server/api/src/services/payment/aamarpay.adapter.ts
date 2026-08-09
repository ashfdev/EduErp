import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";
import { resolveGatewayCredentials } from "./gateway-config.helper";

// Real AamarPay integration needs a Store ID + Signature Key (env fallback)
// or an active Settings -> Payment Gateways entry (mapped to app_key/
// app_secret, matching the other four gateways) — deferred per the same
// standing user decision as bKash/Nagad/SSLCommerz/Rocket. Adapter shape is
// ready for real credentials.
export const aamarpayAdapter: PaymentGatewayAdapter = {
  name: "AAMARPAY",
  isConfigured: async () =>
    (
      await resolveGatewayCredentials("AAMARPAY", {
        app_key: process.env.AAMARPAY_STORE_ID,
        app_secret: process.env.AAMARPAY_SIGNATURE_KEY,
      })
    ).configured,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!(await this.isConfigured())) {
      return { status: "FAILED" };
    }
    throw new Error("AamarPay sandbox integration not yet implemented — credentials are set but the API call itself is a placeholder");
  },
  async verifyCallback() {
    throw new Error("AamarPay callback verification not yet implemented");
  },
};
