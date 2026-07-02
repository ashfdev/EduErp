import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";

// Real Nagad integration needs NAGAD_MERCHANT_ID/NAGAD_MERCHANT_PRIVATE_KEY —
// deferred per standing user decision. Shape is ready for real credentials.
export const nagadAdapter: PaymentGatewayAdapter = {
  name: "NAGAD",
  isConfigured: () => Boolean(process.env.NAGAD_MERCHANT_ID && process.env.NAGAD_MERCHANT_PRIVATE_KEY),
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: "FAILED" };
    }
    throw new Error("Nagad sandbox integration not yet implemented");
  },
  async verifyCallback() {
    throw new Error("Nagad callback verification not yet implemented");
  },
};
