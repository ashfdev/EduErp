import type { NextFunction, Request, Response } from 'express';
import { hasDefaultGrant, type PermissionAction, type PermissionModule } from '../lib/permissions.js';

/**
 * Must run after requireAuth + requireTenant. Checks the tenant's RolePermission
 * table first (lets Institution Admin narrow or widen a role's access per module
 * without a code change), falling back to the hardcoded PRD §3 defaults when no
 * override row exists for that (tenant, role, module, action) combination.
 */
export function requirePermission(module: PermissionModule, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.tenantId || !req.db) {
      return res.status(403).json({ error: 'No tenant context on this account' });
    }

    const role = req.user.role;

    const override = await req.db.rolePermission.findUnique({
      where: { tenantId_role_module_action: { tenantId: req.tenantId, role: role as never, module, action } },
    });

    const allowed = override ? override.allowed : hasDefaultGrant(role, module, action);

    if (!allowed) {
      return res.status(403).json({ error: `Missing permission: ${module}:${action}` });
    }

    return next();
  };
}
