import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { verifyAccessToken } from "../lib/jwt";

// What an account still on its temporary password may call. Everything else
// answers 403 until the user has chosen their own password, so the
// must_change_password flag holds even for a client that ignores it.
const TEMP_PASSWORD_ALLOWED = new Set(["/api/auth/change-password", "/api/auth/me", "/api/auth/lang"]);

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: "TOKEN_MISSING", message: "Authorization token is required" },
    });
  }

  try {
    req.user = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ success: false, error: { code: "TOKEN_EXPIRED", message: "Token expired" } });
    }
    if (err instanceof JsonWebTokenError) {
      return res.status(401).json({ success: false, error: { code: "TOKEN_INVALID", message: "Invalid token" } });
    }
    return res.status(401).json({ success: false, error: { code: "TOKEN_INVALID", message: "Invalid token" } });
  }

  if (req.user.pwc && !TEMP_PASSWORD_ALLOWED.has(req.originalUrl.split("?")[0] ?? "")) {
    return res.status(403).json({
      success: false,
      error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Change your temporary password to continue" },
    });
  }
  return next();
}
