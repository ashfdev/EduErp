import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";

// Real Rocket (DBBL) integration needs ROCKET_MERCHANT_ID/ROCKET_MERCHANT_KEY —
// deferred per standing user decision (external accounts/credentials not yet
// set up). Shape is ready for real credentials, mirrors nagad.adapter.ts.
export const rocketAdapter: PaymentGatewayAdapter = {
  name: "ROCKET",
  isConfigured: () => Boolean(process.env.ROCKET_MERCHANT_ID && process.env.ROCKET_MERCHANT_KEY),
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: "FAILED" };
    }
    throw new Error("Rocket sandbox integration not yet implemented");
  },
  async verifyCallback() {
    throw new Error("Rocket callback verification not yet implemented");
  },
};
