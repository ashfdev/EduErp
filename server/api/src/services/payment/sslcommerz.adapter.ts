import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";
import { resolveGatewayCredentials } from "./gateway-config.helper";

// Real SSLCommerz integration needs SSLCOMMERZ_STORE_ID/SSLCOMMERZ_STORE_PASSWORD
// (env fallback) or an active Settings -> Payment Gateways entry (mapped to
// app_key/app_secret, Plan Fourteen Phase D2) — deferred per standing user
// decision. Shape is ready for real credentials.
export const sslcommerzAdapter: PaymentGatewayAdapter = {
  name: "SSLCOMMERZ",
  isConfigured: async () =>
    (
      await resolveGatewayCredentials("SSLCOMMERZ", {
        app_key: process.env.SSLCOMMERZ_STORE_ID,
        app_secret: process.env.SSLCOMMERZ_STORE_PASSWORD,
      })
    ).configured,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!(await this.isConfigured())) {
      return { status: "FAILED" };
    }
    throw new Error("SSLCommerz sandbox integration not yet implemented");
  },
  async verifyCallback() {
    throw new Error("SSLCommerz callback verification not yet implemented");
  },
};
