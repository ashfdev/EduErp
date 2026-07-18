import { prisma } from "./prisma";
import { logger } from "./logger";
import * as roles from "./roles";
import type { UserRole } from "@education-erp/types";

// Populates every roles.ts _ROLES constant's array CONTENTS (never
// reassigns the export — authorize(SOME_ROLES) call sites hold a reference
// to the array object itself) from the DB-backed Permission/RolePermission
// tables (Phase 84). Mutating in place means every one of the 300+
// authorize() call sites across the API is reading the DB-backed values on
// the very next request after an edit — no restart, no re-registration of
// routes, no changes to any of those call sites.
export async function refreshPermissions(): Promise<void> {
  const permissions = await prisma.permission.findMany({ include: { role_permissions: true } });
  if (permissions.length === 0) {
    // DB not seeded yet (fresh install before `prisma db seed` has run, or
    // mid-migration) — leave every constant at its hardcoded roles.ts
    // default rather than wiping every array to empty and locking
    // everyone out of the whole API.
    logger.warn("refreshPermissions: no Permission rows found — keeping roles.ts hardcoded defaults");
    return;
  }

  const rolesByKey = roles as unknown as Record<string, UserRole[]>;
  for (const permission of permissions) {
    const target = rolesByKey[permission.key];
    if (!target) {
      logger.warn({ key: permission.key }, "refreshPermissions: DB has a Permission row with no matching roles.ts export — skipping");
      continue;
    }
    const dbRoles = permission.role_permissions.map((rp) => rp.role);
    target.length = 0;
    target.push(...dbRoles);
  }
}

// Same function, called at server startup — kept as a separately-named
// export so call sites read as "load once at boot" vs. "refresh after an
// edit", even though the underlying work is identical.
export const loadPermissionsFromDb = refreshPermissions;
