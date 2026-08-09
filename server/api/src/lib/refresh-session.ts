import { redis } from "./redis";

// Real gap found during a full-system security audit (2026-08-09): refresh
// tokens were keyed in Redis ONLY by the token value itself
// (`refresh:${token}` -> userId), with no secondary per-user index. Neither
// /change-password nor /reset-password revoked any OTHER outstanding
// refresh token for that user, so a stolen refresh token stayed valid for
// up to its full 7-day life even after the account owner changed their
// password specifically because they suspected a compromise. This module
// adds a per-user session index (a Redis Set of live token values) so every
// refresh token belonging to a user can be found and revoked together,
// without changing what a single token lookup/verification looks like for
// every other existing call site.
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const userSessionsKey = (userId: string) => `refresh:sessions:${userId}`;

// Call this everywhere a refresh token is minted (login, refresh-rotation) —
// alongside the existing `redis.set(refresh:${token}, userId, EX, ttl)` call,
// never as a replacement for it.
export async function registerRefreshToken(userId: string, token: string): Promise<void> {
  const key = userSessionsKey(userId);
  await redis.sadd(key, token);
  // The Set itself needs its own expiry too, or it would accumulate forever
  // for a user who never gets fully logged out — refreshed on every new
  // token exactly like the token's own TTL, so the set's lifetime always
  // covers its longest-lived member.
  await redis.expire(key, REFRESH_TTL_SECONDS);
}

// Call this wherever a single token is deliberately invalidated (logout,
// refresh-rotation replacing the old token) — removes just that one token
// from its owner's session set, without touching any of the user's other
// live sessions.
export async function unregisterRefreshToken(userId: string, token: string): Promise<void> {
  await redis.srem(userSessionsKey(userId), token);
}

// The actual fix: revoke every refresh token a user currently holds, in one
// call. Deletes each individual `refresh:${token}` key (so /refresh's own
// `redis.get(refresh:${token})` lookup correctly starts failing for all of
// them immediately) plus the session-index Set itself.
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  const key = userSessionsKey(userId);
  const tokens = await redis.smembers(key);
  if (tokens.length > 0) {
    await redis.del(...tokens.map((t) => `refresh:${t}`));
  }
  await redis.del(key);
}
