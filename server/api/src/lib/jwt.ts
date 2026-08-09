import jwt from "jsonwebtoken";
import type { JwtAccessPayload } from "@education-erp/types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "";
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES ?? "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? "7d";

// Pinned explicitly (security audit, 2026-08-09) rather than left to
// jsonwebtoken's default algorithm inference — with a plain HMAC string
// secret this isn't currently exploitable (there's no asymmetric public key
// for an attacker to redirect verification onto), but stating the allowed
// algorithm outright is a stated safety property instead of an implicit one.
const JWT_ALGORITHM = "HS256" as const;

export function signAccessToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES as jwt.SignOptions["expiresIn"], algorithm: JWT_ALGORITHM });
}

export function signRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES as jwt.SignOptions["expiresIn"], algorithm: JWT_ALGORITHM });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  return jwt.verify(token, ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] }) as JwtAccessPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] }) as { sub: string };
}
