import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";

// Real SSLCommerz integration needs SSLCOMMERZ_STORE_ID/SSLCOMMERZ_STORE_PASSWORD —
// deferred per standing user decision. Shape is ready for real credentials.
export const sslcommerzAdapter: PaymentGatewayAdapter = {
  name: "SSLCOMMERZ",
  isConfigured: () => Boolean(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD),
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: "FAILED" };
    }
    throw new Error("SSLCommerz sandbox integration not yet implemented");
  },
  async verifyCallback() {
    throw new Error("SSLCommerz callback verification not yet implemented");
  },
};
