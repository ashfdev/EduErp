import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { resolveEncryptionKey } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT = "eduerp-at-rest-secret-v1";

function deriveKey(): Buffer {
  return scryptSync(resolveEncryptionKey(), SALT, 32);
}

// AES-256-GCM at-rest encryption for sensitive Settings-stored credentials
// (payment gateway app_secret/password, Plan Fourteen Phase D2). Not used for
// anything a user authenticates with -- login passwords use bcrypt, JWTs use
// HMAC -- this is specifically for secrets the server itself must be able to
// recover in plaintext later to call a third-party API.
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, dataB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
