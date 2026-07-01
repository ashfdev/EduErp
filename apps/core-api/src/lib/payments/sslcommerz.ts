import type { InitiatePaymentInput, InitiatePaymentResult, PaymentGatewayAdapter } from './types.js';
import { GatewayNotConfiguredError } from './types.js';

/**
 * SSLCommerz — aggregator fallback covering cards + most mobile banking (PRD §10.2).
 * Not wired to a real sandbox — no store credentials exist yet (ROADMAP.md
 * "External accounts"). SSLCommerz's sandbox is usually the quickest of the four
 * to get working once a store ID/password exists, since it's a single REST call
 * to /gwprocess/v4/api.php — implement that once credentials are available.
 */
export const sslcommerzGateway: PaymentGatewayAdapter = {
  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const { SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD, SSLCOMMERZ_BASE_URL } = process.env;
    if (!SSLCOMMERZ_STORE_ID || !SSLCOMMERZ_STORE_PASSWORD || !SSLCOMMERZ_BASE_URL) {
      throw new GatewayNotConfiguredError('SSLCommerz');
    }

    void input;
    throw new Error('SSLCommerz credentials present but the sandbox call is not yet implemented — build once credentials are confirmed working.');
  },
};
