import { prisma } from "../../lib/prisma";
import { decryptSecret } from "../../lib/crypto";
import type { PaymentGatewayProvider } from "@education-erp/db";

export interface ResolvedGatewayCredentials {
  configured: boolean;
  app_key?: string;
  app_secret?: string;
  username?: string;
  password?: string;
}

// DB-stored, admin-entered credentials (Settings -> Payment Gateways, Plan
// Fourteen Phase D2) win when a row exists and is marked active; otherwise
// falls back to the env vars each adapter has always read. Never throws --
// "not configured" is a normal, expected state every adapter's
// isConfigured() already treats as such.
export async function resolveGatewayCredentials(
  provider: PaymentGatewayProvider,
  envFallback: { app_key?: string; app_secret?: string; username?: string; password?: string },
): Promise<ResolvedGatewayCredentials> {
  const row = await prisma.paymentGatewayConfig.findUnique({ where: { provider } });
  if (row?.is_active && row.app_key && row.app_secret) {
    return {
      configured: true,
      app_key: row.app_key,
      app_secret: decryptSecret(row.app_secret),
      username: row.username ?? undefined,
      password: row.password ? decryptSecret(row.password) : undefined,
    };
  }
  return { configured: Boolean(envFallback.app_key && envFallback.app_secret), ...envFallback };
}
