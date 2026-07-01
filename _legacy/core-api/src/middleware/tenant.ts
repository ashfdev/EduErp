import type { NextFunction, Request, Response } from 'express';
import { scopedToTenant, type ScopedPrismaClient } from '../lib/prisma.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
      db?: ScopedPrismaClient;
    }
  }
}

/**
 * Must run after requireAuth. Pulls tenantId from the authenticated user's JWT claim
 * (never from a client-supplied header/body — that would let a caller spoof another
 * tenant) and attaches a Prisma client pre-scoped to that tenant.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: 'No tenant context on this account' });
  }

  req.tenantId = tenantId;
  req.db = scopedToTenant(tenantId);
  return next();
}
