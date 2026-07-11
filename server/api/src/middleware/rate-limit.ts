import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { decode } from "jsonwebtoken";
import type { Request } from "express";
import { redis } from "../lib/redis";
import { badRequest } from "../lib/errors";

function redisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
  });
}

const RATE_LIMITED_ERROR = { success: false, error: { code: "RATE_LIMITED", message: "Too many requests — please try again shortly." } };

// Public, unauthenticated endpoints (result lookup, certificate verify,
// contact forms, etc.) get a shared conservative limit.
export const publicEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:public:"),
  message: RATE_LIMITED_ERROR,
});

// /api/content/* (public website reads) get a much more generous limit —
// this is read traffic from anonymous page loads, not a sensitive action.
export const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:content:"),
  message: RATE_LIMITED_ERROR,
});

const LOGIN_BAN_SECONDS = 60 * 60;
const LOGIN_BAN_PREFIX = "rl:login-ban:";

// A plain windowed limiter resets after windowMs elapses even if the limit
// was hit — that under-delivers on "ban for 1hr on exceeded". This checks a
// separate, longer-lived Redis ban key first, and the limiter's own
// `handler` sets that key the moment the 5-in-15-min threshold is crossed.
export async function loginBanGuard(req: Request, res: import("express").Response, next: import("express").NextFunction) {
  const banned = await redis.get(`${LOGIN_BAN_PREFIX}${req.ip}`);
  if (banned) {
    res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Too many failed login attempts. Try again in an hour." } });
    return;
  }
  next();
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:login:"),
  handler: async (req, res) => {
    await redis.set(`${LOGIN_BAN_PREFIX}${req.ip}`, "1", "EX", LOGIN_BAN_SECONDS);
    res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Too many failed login attempts. Try again in an hour." } });
  },
});

// Keyed by phone (the resource being protected), not IP — an attacker
// rotating IPs shouldn't get unlimited OTP requests against one victim's number.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:forgot-password:"),
  keyGenerator: (req) => {
    const phone = req.body?.phone;
    if (typeof phone !== "string" || !phone) throw badRequest("phone is required");
    return phone;
  },
  message: RATE_LIMITED_ERROR,
});

// Global default, mounted in app.ts before any router's own authenticate()
// runs — so there's no req.user yet to key off. Decodes the JWT's `sub`
// claim directly (unverified — this is only a rate-limit bucketing key, not
// an authorization decision; authenticate() still does the real signature
// verification downstream) and falls back to IP for anonymous requests.
export const defaultApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:default:"),
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (token) {
      const payload = decode(token);
      if (payload && typeof payload === "object" && typeof payload.sub === "string") return payload.sub;
    }
    return req.ip ?? "unknown";
  },
  message: RATE_LIMITED_ERROR,
});

// Quiz anti-cheat tamper-flag endpoint (Phase 36) — called frequently
// client-side (every tab-switch/blur during an active attempt), needs a
// generous but real cap so it can't be used to flood the API.
export const quizFlagLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:quiz-flag:"),
  message: RATE_LIMITED_ERROR,
});

// Vehicle location-ping ingestion (Phase 37) — runs before deviceKeyAuth, so
// this is keyed by the raw x-device-key header rather than req.vehicle.id
// (bucketing per claimed device, same spirit as forgotPasswordLimiter keying
// on the phone in the body rather than IP).
export const vehiclePingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore("rl:vehicle-ping:"),
  keyGenerator: (req) => {
    const key = req.headers["x-device-key"];
    return typeof key === "string" && key ? key : (req.ip ?? "unknown");
  },
  message: RATE_LIMITED_ERROR,
});
