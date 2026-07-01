import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from './types.js';
import { GatewayNotConfiguredError } from './types.js';

/**
 * Nagad checkout integration. Not wired to a real sandbox — no merchant
 * credentials exist yet (ROADMAP.md "External accounts"). See bkash.ts for the
 * same caveat: implement the actual initialize/verify calls once credentials
 * are available to test against.
 */
export const nagadGateway: PaymentGatewayAdapter = {
  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { NAGAD_MERCHANT_ID, NAGAD_MERCHANT_PRIVATE_KEY, NAGAD_PG_PUBLIC_KEY, NAGAD_BASE_URL } = process.env;
    if (!NAGAD_MERCHANT_ID || !NAGAD_MERCHANT_PRIVATE_KEY || !NAGAD_PG_PUBLIC_KEY || !NAGAD_BASE_URL) {
      throw new GatewayNotConfiguredError('Nagad');
    }

    void input;
    throw new Error('Nagad credentials present but the sandbox call is not yet implemented — build once credentials are confirmed working.');
  },
};
