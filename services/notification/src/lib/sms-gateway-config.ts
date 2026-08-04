import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";
import type { SmsGatewayProvider } from "@education-erp/db";

export interface ActiveSmsGateway {
  provider: SmsGatewayProvider;
  api_key: string;
  api_secret?: string;
  sender_id?: string;
  api_url?: string;
}

// Looked up fresh on every SMS send (called from inside sms.worker.ts's
// per-job handler, not cached at process startup) -- an admin updating
// credentials in Settings takes effect on the very next send with no
// restart of this service needed, exactly mirroring server/api's own
// resolveGatewayCredentials() for payment gateways. Returns null when no
// provider is active, letting the caller fall back to the existing env-var
// based SSL Wireless / mock logic unchanged.
export async function resolveActiveSmsGateway(): Promise<ActiveSmsGateway | null> {
  const row = await prisma.smsGatewayConfig.findFirst({ where: { is_active: true } });
  if (!row?.api_key) return null;
  return {
    provider: row.provider,
    api_key: decryptSecret(row.api_key),
    api_secret: row.api_secret ? decryptSecret(row.api_secret) : undefined,
    sender_id: row.sender_id ?? undefined,
    api_url: row.api_url ?? undefined,
  };
}
