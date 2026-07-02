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
export const ATTENDANCE_MARK_ROLES: UserRole[] = ["ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
export const EXAM_MANAGE_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const MARK_ENTRY_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER"];
export const MARK_APPROVAL_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const RESULT_PUBLISH_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const FEE_COLLECTION_ROLES: UserRole[] = ["ADMIN", "ACCOUNTANT"];
export const ADMISSION_MANAGE_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const ADMISSION_ENROLL_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL"];
export const WEBSITE_CONTENT_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL", "IT_ADMIN"];
export const HR_MANAGE_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL"];
export const LEAVE_APPROVE_ROLES: UserRole[] = ["ADMIN", "PRINCIPAL"];
export const PAYROLL_MANAGE_ROLES: UserRole[] = ["ADMIN", "ACCOUNTANT"];
export const LIBRARY_MANAGE_ROLES: UserRole[] = ["ADMIN", "LIBRARIAN"];
export const TRANSPORT_MANAGE_ROLES: UserRole[] = ["ADMIN", "TRANSPORT_MANAGER"];
export const HOSTEL_MANAGE_ROLES: UserRole[] = ["ADMIN", "HOSTEL_MANAGER"];
export const PORTAL_ROLES: UserRole[] = ["STUDENT", "GUARDIAN"];

// Every staff-facing role — i.e. every role except the two portal-only ones.
// Used to lock admin-panel routers (documents, full student profile) out of
// STUDENT/GUARDIAN tokens now that Phase 15 makes those a real, actively-used
// login path — those roles must go through the ownership-checked
// /api/portal/* routes instead of the admin endpoints directly.
export const STAFF_ONLY_ROLES: UserRole[] = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
];
