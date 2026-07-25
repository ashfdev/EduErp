import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from "./gateway.interface";

// Unlike the other gateways, bank transfer needs no external API/credentials
// — it's always "the student claims they've transferred, staff verifies
// manually against the bank statement." initiatePayment always returns
// INITIATED (never COMPLETED/FAILED synchronously); the student then
// uploads a slip (Payment.receipt_url) and an ACCOUNTANT marks it verified
// via POST /api/fees/payments/:id/verify-bank-transfer, which runs the same
// completion logic the other gateways' webhook callback runs.
export const bankTransferAdapter: PaymentGatewayAdapter = {
  name: "BANK_TRANSFER",
  isConfigured: async () => true,
  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    return { status: "INITIATED" };
  },
  async verifyCallback() {
    throw new Error("Bank transfers have no callback — verified manually via the /verify-bank-transfer endpoint");
  },
};
