import type { UserRole } from "@education-erp/types";

// Mirrors CLAUDE.md's Permission Matrix table.
export const SETTINGS_INSTITUTION_ROLES: UserRole[] = ["ADMIN", "IT_ADMIN"];
export const SETTINGS_ACADEMIC_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const SETTINGS_USERS_ROLES: UserRole[] = ["ADMIN", "IT_ADMIN"];
export const STUDENT_CRUD_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "REGISTRAR"];
export const STUDENT_PROMOTE_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const STAFF_READ_ROLES: UserRole[] = [
  "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
];
