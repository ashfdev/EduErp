import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from './types.js';
import { GatewayNotConfiguredError } from './types.js';

/**
 * bKash Checkout (Tokenized) integration — https://developer.bka.sh
 * Not wired to a real sandbox: no merchant credentials exist yet (ROADMAP.md
 * "External accounts"). The grant/execute flow below matches bKash's documented
 * API shape but is UNTESTED against a live sandbox — verify against real
 * BKASH_APP_KEY/APP_SECRET/USERNAME/PASSWORD before trusting this in production.
 */
export const bkashGateway: PaymentGatewayAdapter = {
  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD, BKASH_BASE_URL } = process.env;
    if (!BKASH_APP_KEY || !BKASH_APP_SECRET || !BKASH_USERNAME || !BKASH_PASSWORD || !BKASH_BASE_URL) {
      throw new GatewayNotConfiguredError('bKash');
    }

    // TODO: grant token -> POST /tokenized/checkout/create -> return bkashURL as redirectUrl.
    void input;
    throw new Error('bKash credentials present but the sandbox call is not yet implemented — build once credentials are confirmed working.');
  },
};
