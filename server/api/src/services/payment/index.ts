import type { PaymentGatewayAdapter } from "./gateway.interface";
import { cashAdapter } from "./cash.adapter";
import { bkashAdapter } from "./bkash.adapter";
import { nagadAdapter } from "./nagad.adapter";
import { sslcommerzAdapter } from "./sslcommerz.adapter";
import { rocketAdapter } from "./rocket.adapter";
import { bankTransferAdapter } from "./bank-transfer.adapter";

const ADAPTERS: Record<string, PaymentGatewayAdapter> = {
  CASH: cashAdapter,
  BKASH: bkashAdapter,
  NAGAD: nagadAdapter,
  SSLCOMMERZ: sslcommerzAdapter,
  ROCKET: rocketAdapter,
  BANK_TRANSFER: bankTransferAdapter,
};

export function getPaymentAdapter(gateway: string): PaymentGatewayAdapter {
  const adapter = ADAPTERS[gateway];
  if (!adapter) throw new Error(`Unknown payment gateway: ${gateway}`);
  return adapter;
}

export * from "./gateway.interface";
