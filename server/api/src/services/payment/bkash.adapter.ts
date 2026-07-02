import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";

// Real bKash Checkout (Tokenized) API integration needs BKASH_APP_KEY/
// BKASH_APP_SECRET/BKASH_USERNAME/BKASH_PASSWORD — deferred per standing
// user decision ("external accounts... will be done later"). The adapter
// shape is real and ready to wire up once sandbox credentials exist.
export const bkashAdapter: PaymentGatewayAdapter = {
  name: "BKASH",
  isConfigured: () => Boolean(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET),
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (!this.isConfigured()) {
      return { status: "FAILED" };
    }
    throw new Error("bKash sandbox integration not yet implemented — BKASH_APP_KEY is set but the API call itself is a placeholder");
  },
  async verifyCallback() {
    throw new Error("bKash callback verification not yet implemented");
  },
};
