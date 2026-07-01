export const MODULES = ['settings', 'academic', 'students', 'staff', 'attendance', 'discipline', 'fees', 'payroll', 'exams', 'website'] as const;
export type PermissionModule = (typeof MODULES)[number];

export const ACTIONS = ['read', 'write', 'manage'] as const;
export type PermissionAction = (typeof ACTIONS)[number];

type Role =
  | 'INSTITUTION_ADMIN' | 'PRINCIPAL' | 'VICE_PRINCIPAL' | 'EXAM_CONTROLLER' | 'HEAD_OF_DEPARTMENT'
  | 'CLASS_TEACHER' | 'SUBJECT_TEACHER' | 'ACCOUNTANT' | 'LIBRARIAN' | 'TRANSPORT_MANAGER'
  | 'HOSTEL_MANAGER' | 'IT_ADMIN' | 'STUDENT' | 'GUARDIAN';

function grant(...pairs: `${PermissionModule}:${PermissionAction}`[]): Set<string> {
  return new Set(pairs);
}

/**
 * Baseline grants, one-to-one with the original hardcoded requireRole(...) lists
 * each route used before this module existed (PRD §3 role table). A tenant's
 * RolePermission rows in the DB override these at runtime — see middleware/permission.ts —
 * so Institution Admin can adjust who can do what per module without a code change.
 * SUPER_ADMIN and roles with no module access yet (LIBRARIAN, TRANSPORT_MANAGER,
 * HOSTEL_MANAGER) are intentionally absent here — they get grants as their modules
 * (Library, Transport, Hostel) are built.
 */
export const DEFAULT_GRANTS: Partial<Record<Role, Set<string>>> = {
  INSTITUTION_ADMIN: grant(
    'settings:manage', 'academic:write',
    'students:read', 'students:write', 'students:manage',
    'staff:read', 'staff:write', 'staff:manage',
    'attendance:read', 'attendance:write',
    'discipline:read', 'discipline:write',
    'fees:read', 'fees:write', 'fees:manage',
    'payroll:read', 'payroll:write', 'payroll:manage',
    'exams:read', 'exams:write', 'exams:manage',
    'website:read', 'website:write', 'website:manage',
  ),
  PRINCIPAL: grant(
    'academic:write',
    'students:read', 'students:write', 'students:manage',
    'staff:read', 'staff:write', 'staff:manage',
    'attendance:read', 'attendance:write',
    'discipline:read', 'discipline:write',
    'fees:read', 'payroll:read',
    'exams:read', 'exams:manage',
    'website:read', 'website:write', 'website:manage',
  ),
  VICE_PRINCIPAL: grant(
    'students:read', 'students:write', 'students:manage',
    'staff:read',
    'attendance:read', 'attendance:write',
    'discipline:read', 'discipline:write',
    'exams:read',
  ),
  EXAM_CONTROLLER: grant(
    'students:read', 'staff:read',
    'exams:read', 'exams:write', 'exams:manage',
  ),
  IT_ADMIN: grant(
    'settings:manage', 'academic:write',
    'students:read', 'students:write',
    'staff:read', 'staff:write', 'staff:manage',
  ),
  CLASS_TEACHER: grant(
    'students:read', 'students:write',
    'attendance:read', 'attendance:write',
    'discipline:read', 'discipline:write',
    'exams:read',
  ),
  SUBJECT_TEACHER: grant(
    'students:read', 'students:write',
    'attendance:read', 'attendance:write',
    'exams:read', 'exams:write',
  ),
  ACCOUNTANT: grant(
    'students:read', 'staff:read',
    'fees:read', 'fees:write', 'fees:manage',
    'payroll:read', 'payroll:write', 'payroll:manage',
  ),
  STUDENT: grant('students:read', 'fees:read', 'exams:read'),
  GUARDIAN: grant('students:read', 'fees:read', 'exams:read'),
};

export function hasDefaultGrant(role: string, module: PermissionModule, action: PermissionAction): boolean {
  return DEFAULT_GRANTS[role as Role]?.has(`${module}:${action}`) ?? false;
}
