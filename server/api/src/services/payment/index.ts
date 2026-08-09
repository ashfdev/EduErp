import { ApiError } from "../../lib/errors";
import type { PaymentGatewayAdapter } from "./gateway.interface";
import { cashAdapter } from "./cash.adapter";
import { bkashAdapter } from "./bkash.adapter";
import { nagadAdapter } from "./nagad.adapter";
import { sslcommerzAdapter } from "./sslcommerz.adapter";
import { rocketAdapter } from "./rocket.adapter";
import { aamarpayAdapter } from "./aamarpay.adapter";
import { bankTransferAdapter } from "./bank-transfer.adapter";

const ADAPTERS: Record<string, PaymentGatewayAdapter> = {
  CASH: cashAdapter,
  BKASH: bkashAdapter,
  NAGAD: nagadAdapter,
  SSLCOMMERZ: sslcommerzAdapter,
  ROCKET: rocketAdapter,
  AAMARPAY: aamarpayAdapter,
  BANK_TRANSFER: bankTransferAdapter,
};

export function getPaymentAdapter(gateway: string): PaymentGatewayAdapter {
  const adapter = ADAPTERS[gateway];
  if (!adapter) throw new Error(`Unknown payment gateway: ${gateway}`);
  return adapter;
}

// Real bug fixed (2026-08-09): every real gateway adapter's initiatePayment()
// throws a plain Error once isConfigured() passes but the actual sandbox API
// call itself is still a placeholder (real merchant credentials pending, per
// the standing deferred decision). A plain `throw new Error(...)` isn't an
// ApiError, so it fell straight through to the generic error-handler branch —
// the adapter's own genuinely informative message ("...not yet implemented —
// credentials are set but the API call itself is a placeholder") was
// discarded server-side and replaced with a bare "Something went wrong"
// before ever reaching the client. Both /initiate call sites (staff-side
// payments.routes.ts and the portal's self-service fees/pay) now go through
// this instead of calling adapter.initiatePayment() directly, so the real
// reason surfaces as a clean 400 with a distinct error code the frontend can
// key off, not a generic 500.
export async function initiatePaymentSafely(
  adapter: PaymentGatewayAdapter,
  input: Parameters<PaymentGatewayAdapter["initiatePayment"]>[0],
): Promise<ReturnType<PaymentGatewayAdapter["initiatePayment"]>> {
  try {
    return await adapter.initiatePayment(input);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : "This payment gateway's integration is not yet implemented.";
    throw new ApiError(400, "GATEWAY_NOT_IMPLEMENTED", message);
  }
}

export * from "./gateway.interface";
