// Who may give which role. Shared so the API enforces it and the admin
// screens only offer roles the signed-in person can actually assign.
// SUPER_ADMIN grants anything, ADMIN anything but SUPER_ADMIN, and every
// other role nothing at or above IT_ADMIN.
const PRIVILEGED_ROLES = ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"];

export function canAssignRole(actorRole: string | null | undefined, role: string): boolean {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "ADMIN") return role !== "SUPER_ADMIN";
  return !PRIVILEGED_ROLES.includes(role);
}
