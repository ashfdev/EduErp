import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@education-erp/types";

export function authorize(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: "TOKEN_MISSING", message: "Not authenticated" } });
    }
    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to perform this action" },
      });
    }
    return next();
  };
}
