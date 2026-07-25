export interface InitiatePaymentInput {
  invoice_id: string;
  amount: number;
  transaction_id: string;
}

export interface InitiatePaymentResult {
  payment_url?: string;
  session_id?: string;
  status: "COMPLETED" | "INITIATED" | "FAILED";
}

export interface PaymentGatewayAdapter {
  name: string;
  // Async because a DB-stored, admin-entered credential (Settings -> Payment
  // Gateways) is checked before falling back to env vars (Plan Fourteen,
  // Phase D2).
  isConfigured(): Promise<boolean>;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyCallback(payload: unknown): Promise<{ transaction_id: string; success: boolean }>;
}
