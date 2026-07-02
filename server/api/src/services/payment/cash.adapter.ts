import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";

/** CASH is always "completed" immediately — there's no external gateway round-trip. */
export const cashAdapter: PaymentGatewayAdapter = {
  name: "CASH",
  isConfigured: () => true,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    return { status: "COMPLETED" };
  },
  async verifyCallback() {
    throw new Error("CASH payments have no callback — they complete synchronously at collection time");
  },
};
