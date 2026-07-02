import type { PaymentGatewayAdapter } from "./gateway.interface";
import { cashAdapter } from "./cash.adapter";
import { bkashAdapter } from "./bkash.adapter";
import { nagadAdapter } from "./nagad.adapter";
import { sslcommerzAdapter } from "./sslcommerz.adapter";

const ADAPTERS: Record<string, PaymentGatewayAdapter> = {
  CASH: cashAdapter,
  BKASH: bkashAdapter,
  NAGAD: nagadAdapter,
  SSLCOMMERZ: sslcommerzAdapter,
};

export function getPaymentAdapter(gateway: string): PaymentGatewayAdapter {
  const adapter = ADAPTERS[gateway];
  if (!adapter) throw new Error(`Unknown payment gateway: ${gateway}`);
  return adapter;
}

export * from "./gateway.interface";
