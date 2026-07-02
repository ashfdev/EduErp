import rateLimit from "express-rate-limit";

// Public, unauthenticated endpoints (result lookup, certificate verify,
// contact forms, etc.) get a shared conservative limit — full per-route
// tuning (login attempts, forgot-password, etc.) lands in Phase 18.
export const publicEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests — please try again shortly." } },
});
