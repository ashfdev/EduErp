import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  ADMIN_URL: z.string().url().optional(),
  PORTAL_URL: z.string().url().optional(),
  WEBSITE_URL: z.string().url().optional(),
  TEACHER_URL: z.string().url().optional(),
  WEBSITE_REVALIDATE_SECRET: z.string().optional(),
  DEVICE_SERVICE_URL: z.string().url().optional(),
  DEVICE_SERVICE_SECRET: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  // Key material for at-rest encryption of sensitive Settings-stored
  // credentials (payment gateway app_secret/password, lib/crypto.ts).
  ENCRYPTION_KEY: z.string().optional(),
  // HMAC secret signing/verifying /api/uploads/local-file download tokens
  // (storage.service.ts) — same fail-loud-in-production convention as
  // ENCRYPTION_KEY below (security audit, 2026-08-09: this previously had a
  // hardcoded fallback with no production enforcement at all).
  LOCAL_STORAGE_SECRET: z.string().optional(),
  // Number of reverse-proxy hops in front of this API (nginx, a cloud load
  // balancer, etc.) — passed to Express's `trust proxy` setting so `req.ip`
  // resolves to the real client address instead of the proxy's own address.
  // Security audit finding (2026-08-09): with no trust-proxy config, every
  // IP-keyed rate limiter/ban (login, OTP, forgot-password) either collapses
  // onto the proxy's one IP (one abusive client bans everyone) or — if a
  // future change reads X-Forwarded-For directly — becomes spoofable by an
  // untrusted client. Default of 1 assumes a single proxy hop, the common
  // case for this deployment shape; override if the real topology differs.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

// Fail fast on a missing/malformed critical var rather than surfacing a
// confusing downstream error the first time that var is actually read.
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// A handful of call sites build a user-facing URL (an uploaded-file link, a
// printed asset QR-code payload) from an optional env var with a localhost
// fallback meant only for local dev. In production, silently falling back
// means shipping a dead localhost link/QR code to a real user — fail loudly
// instead so a missing var is caught at the call site, not discovered later
// on a printed asset tag or a shared document link.
export function resolveBaseUrl(varName: string, value: string | undefined, devFallback: string): string {
  if (value) return value;
  if (env.NODE_ENV === "production") {
    throw new Error(`${varName} must be set in production — refusing to fall back to a localhost URL`);
  }
  return devFallback;
}

// Same fail-loud-in-production, dev-only-fallback convention as
// resolveBaseUrl above, applied to the key material backing at-rest secret
// encryption (lib/crypto.ts) instead of a URL.
export function resolveEncryptionKey(): string {
  if (env.ENCRYPTION_KEY) return env.ENCRYPTION_KEY;
  if (env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production — refusing to use a dev-only fallback for at-rest secret encryption");
  }
  return "dev-only-insecure-encryption-key-do-not-use-in-prod";
}

// Same fail-loud-in-production convention, for the HMAC secret backing
// signed local-file download URLs (storage.service.ts). Real gap found
// during a full-system security audit (2026-08-09): previously a bare
// `process.env.LOCAL_STORAGE_SECRET ?? "dev-local-storage-secret"` with no
// enforcement at all — if left unset in a production deployment using the
// local-disk storage fallback (no Azure connection string configured),
// anyone could forge a valid signed download URL for any file, since the
// signing secret would be a hardcoded string visible in source control.
export function resolveLocalStorageSecret(): string {
  if (env.LOCAL_STORAGE_SECRET) return env.LOCAL_STORAGE_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("LOCAL_STORAGE_SECRET must be set in production — refusing to use a dev-only fallback for signed file-download URLs");
  }
  return "dev-local-storage-secret";
}

// Same fail-loud-in-production convention, for the shared secret gating
// service-to-service calls between server/api and services/device (both
// the outbound biometric-event webhook and the inbound device-management
// routes). Real gap found during the same audit: 3 separate call sites each
// had their own bare `process.env.DEVICE_SERVICE_SECRET ?? "dev-only-
// device-secret"` fallback with no production enforcement — if left unset,
// service-to-service auth would silently default to a secret visible in
// source, and the endpoint it protects (POST /internal/attendance/
// biometric-event) sits outside /api entirely, so it also never receives
// the global rate limiter.
export function resolveDeviceServiceSecret(): string {
  if (env.DEVICE_SERVICE_SECRET) return env.DEVICE_SERVICE_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("DEVICE_SERVICE_SECRET must be set in production — refusing to use a dev-only fallback for service-to-service auth");
  }
  return "dev-only-device-secret";
}
