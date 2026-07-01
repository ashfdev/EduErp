export interface InitiatePaymentInput {
  invoiceId: string;
  amount: number; // BDT
  studentName: string;
}

export interface InitiatePaymentResult {
  transactionId: string;
  status: 'SUCCESS' | 'PENDING';
  redirectUrl?: string; // set for online gateways the browser must be sent to
}

export interface PaymentGatewayAdapter {
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
}

export class GatewayNotConfiguredError extends Error {
  constructor(gateway: string) {
    super(`${gateway} is not configured — missing merchant credentials in env. See ROADMAP.md "External accounts".`);
  }
}
