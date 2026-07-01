import crypto from 'node:crypto';

export interface RegisterDocumentInput {
  tenantId: string;
  docType: string;
  entityId: string;
  canonicalData: Record<string, unknown>; // hashed for tamper-evidence, never returned as-is
  publicPayload: Record<string, unknown>; // safe-to-show facts (name, class, doc type, issue date)
}

export interface RegisteredDocument {
  verificationCode: string;
  contentHash: string;
}

/**
 * Certificate Verification Portal (v1 addition, plan §2.2): every generated
 * marksheet/admit-card/TC gets a short code + content hash. The QR printed on
 * the document encodes a URL containing the code; GET /api/v1/verify/:code
 * resolves it publicly without exposing raw marks/NID.
 */
export function buildDocumentRegistration(input: RegisterDocumentInput): RegisteredDocument & { publicPayload: Record<string, unknown> } {
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(input.canonicalData)).digest('hex');
  const verificationCode = crypto.randomBytes(6).toString('base64url'); // ~8 url-safe chars

  return { verificationCode, contentHash, publicPayload: input.publicPayload };
}
