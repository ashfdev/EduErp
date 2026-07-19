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
