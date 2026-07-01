import { generateSecret, generateURI, verify } from 'otplib';

export function generateTotpSecret(): string {
  return generateSecret();
}

export function generateTotpUri(label: string, secret: string): string {
  return generateURI({ issuer: 'Education ERP', label, secret });
}

export async function verifyTotpCode(token: string, secret: string): Promise<boolean> {
  const result = await verify({ token, secret });
  return result.valid;
}
