import type { UserRole } from "@education-erp/types";

// Mirrors CLAUDE.md's Permission Matrix table.
export const SETTINGS_INSTITUTION_ROLES: UserRole[] = ["ADMIN", "IT_ADMIN"];
export const SETTINGS_ACADEMIC_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const SETTINGS_USERS_ROLES: UserRole[] = ["ADMIN", "IT_ADMIN"];
