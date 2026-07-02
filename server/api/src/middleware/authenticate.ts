import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { verifyAccessToken } from "../lib/jwt";

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
    return next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ success: false, error: { code: "TOKEN_EXPIRED", message: "Token expired" } });
    }
    if (err instanceof JsonWebTokenError) {
      return res.status(401).json({ success: false, error: { code: "TOKEN_INVALID", message: "Invalid token" } });
    }
    return res.status(401).json({ success: false, error: { code: "TOKEN_INVALID", message: "Invalid token" } });
  }
}
