import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";
import { resolveGatewayCredentials } from "./gateway-config.helper";

// Real Nagad integration needs NAGAD_MERCHANT_ID/NAGAD_MERCHANT_PRIVATE_KEY
// (env fallback) or an active Settings -> Payment Gateways entry (mapped to
// app_key/app_secret, Plan Fourteen Phase D2) — deferred per standing user
// decision. Shape is ready for real credentials.
export const nagadAdapter: PaymentGatewayAdapter = {
  name: "NAGAD",
  isConfigured: async () =>
    (
      await resolveGatewayCredentials("NAGAD", {
        app_key: process.env.NAGAD_MERCHANT_ID,
        app_secret: process.env.NAGAD_MERCHANT_PRIVATE_KEY,
      })
    ).configured,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!(await this.isConfigured())) {
      return { status: "FAILED" };
    }
    throw new Error("Nagad sandbox integration not yet implemented");
  },
  async verifyCallback() {
    throw new Error("Nagad callback verification not yet implemented");
  },
};
