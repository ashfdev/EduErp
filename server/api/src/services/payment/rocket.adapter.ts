import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";
import { resolveGatewayCredentials } from "./gateway-config.helper";

// Real Rocket (DBBL) integration needs ROCKET_MERCHANT_ID/ROCKET_MERCHANT_KEY
// (env fallback) or an active Settings -> Payment Gateways entry (mapped to
// app_key/app_secret, Plan Fourteen Phase D2) — deferred per standing user
// decision (external accounts/credentials not yet set up). Shape is ready
// for real credentials, mirrors nagad.adapter.ts.
export const rocketAdapter: PaymentGatewayAdapter = {
  name: "ROCKET",
  isConfigured: async () =>
    (
      await resolveGatewayCredentials("ROCKET", {
        app_key: process.env.ROCKET_MERCHANT_ID,
        app_secret: process.env.ROCKET_MERCHANT_KEY,
      })
    ).configured,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!(await this.isConfigured())) {
      return { status: "FAILED" };
    }
    throw new Error("Rocket sandbox integration not yet implemented");
  },
  async verifyCallback() {
    throw new Error("Rocket callback verification not yet implemented");
  },
};
