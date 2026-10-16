import type { UserRole } from "@education-erp/db";
import { canAssignRole } from "@education-erp/validators";
import { prisma } from "./prisma";
import { badRequest, forbidden } from "./errors";

// Nobody can raise their own access or take over an account that ranks
// above them: see canAssignRole in packages/validators/src/roles.ts.
const ADMIN_ROLES: readonly UserRole[] = ["SUPER_ADMIN", "ADMIN"];

export { canAssignRole };

export function assertCanAssignRole(actorRole: UserRole, role: UserRole): void {
  if (!canAssignRole(actorRole, role)) throw forbidden(`Your role can't give anyone the ${role} role`);
}

// Resetting a password, changing the role of, or deactivating an account is
// limited the same way, judged by the role that account holds now.
export function assertCanManageUser(actorRole: UserRole, targetRole: UserRole): void {
  if (!canAssignRole(actorRole, targetRole)) throw forbidden(`Your role can't manage a ${targetRole} account`);
}

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

// Refuses to deactivate or demote the last active SUPER_ADMIN/ADMIN, which
// would leave nobody able to manage users.
export async function assertNotLastAdmin(targetId: string, targetRole: UserRole): Promise<void> {
  if (!isAdminRole(targetRole)) return;
  const others = await prisma.user.count({ where: { role: { in: [...ADMIN_ROLES] }, is_active: true, id: { not: targetId } } });
  if (others === 0) throw badRequest("This is the last active admin account. Make another user an admin first.");
}
