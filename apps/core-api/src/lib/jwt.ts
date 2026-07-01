import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // user id
  tenantId: string | null;
  role: string;
  impersonatedBy?: string; // Super Admin's user id, set only during impersonation
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret';
// jsonwebtoken types expiresIn as a branded template-literal string (via `ms`);
// env vars come in as plain `string`, so the cast is required at this one boundary.
const ACCESS_TTL = (process.env.JWT_ACCESS_TTL ?? '15m') as jwt.SignOptions['expiresIn'];
const REFRESH_TTL = (process.env.JWT_REFRESH_TTL ?? '30d') as jwt.SignOptions['expiresIn'];

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}
