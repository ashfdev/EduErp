import { cashGateway } from './cash.js';
import { bkashGateway } from './bkash.js';
import { nagadGateway } from './nagad.js';
import { sslcommerzGateway } from './sslcommerz.js';
import type { PaymentGatewayAdapter } from './types.js';

export * from './types.js';

const GATEWAYS: Record<string, PaymentGatewayAdapter> = {
  CASH: cashGateway,
  BKASH: bkashGateway,
  NAGAD: nagadGateway,
  SSLCOMMERZ: sslcommerzGateway,
};

export function getGateway(name: string): PaymentGatewayAdapter {
  const gateway = GATEWAYS[name];
  if (!gateway) throw new Error(`Unknown payment gateway: ${name}`);
  return gateway;
}
