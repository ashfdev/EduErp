import { createDecipheriv, scryptSync } from "node:crypto";

// Decrypt-only mirror of server/api/src/lib/crypto.ts -- this service never
// writes a credential (only server/api's Settings routes do that), it only
// needs to read back what was encrypted there. Must stay byte-for-byte
// algorithm/salt-compatible with that file, and both processes must be
// configured with the SAME ENCRYPTION_KEY env var (a single-institution
// deployment already expects DATABASE_URL/REDIS_URL to match across every
// service that shares this database -- ENCRYPTION_KEY is no different).
const ALGORITHM = "aes-256-gcm";
const SALT = "eduerp-at-rest-secret-v1";

function resolveEncryptionKey(): string {
  if (process.env.ENCRYPTION_KEY) return process.env.ENCRYPTION_KEY;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production — refusing to use a dev-only fallback for at-rest secret decryption");
  }
  return "dev-only-insecure-encryption-key-do-not-use-in-prod";
}

function deriveKey(): Buffer {
  return scryptSync(resolveEncryptionKey(), SALT, 32);
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, dataB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
