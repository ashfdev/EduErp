import { randomUUID } from 'node:crypto';
import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from './types.js';

/** Manual/counter collection (PRD §10.2) — resolves immediately, no external call. */
export const cashGateway: PaymentGatewayAdapter = {
  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    void input;
    return { transactionId: `CASH-${Date.now()}-${randomUUID().slice(0, 8)}`, status: 'SUCCESS' };
  },
};
