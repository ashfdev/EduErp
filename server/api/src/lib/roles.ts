import type { UserRole } from "@education-erp/types";

// Mirrors CLAUDE.md's Permission Matrix table.
// SUPER_ADMIN added to every array below on 2026-07-11 — authorize() has no
// automatic ADMIN/SUPER_ADMIN bypass (see middleware/authorize.ts), so any
// array listing ADMIN but not SUPER_ADMIN silently locked the platform-owner
// role out of that entire route group. Found during a full-repo audit;
// fixed everywhere at once rather than patched array-by-array.
export const SETTINGS_INSTITUTION_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"];
export const SETTINGS_ACADEMIC_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const SETTINGS_USERS_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"];
export const STUDENT_CRUD_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "REGISTRAR"];
export const STUDENT_PROMOTE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const STAFF_READ_ROLES: UserRole[] = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
];
export const ATTENDANCE_MARK_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
export const EXAM_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const MARK_ENTRY_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER"];
// Read-only grid access — adds CLASS_TEACHER on top of MARK_ENTRY_ROLES so a
// class teacher can monitor their own class's marks even though they can't
// submit/edit them (that stays gated to MARK_ENTRY_ROLES on POST /submit).
export const MARK_VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER", "CLASS_TEACHER"];
export const MARK_APPROVAL_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const RESULT_PUBLISH_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const FEE_COLLECTION_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
export const ADMISSION_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const ADMISSION_ENROLL_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const WEBSITE_CONTENT_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "IT_ADMIN"];
export const HR_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const LEAVE_APPROVE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const PAYROLL_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
export const LIBRARY_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "LIBRARIAN"];
// Reviews/approves student-initiated sensitive-document requests (TC,
// Testimonial) — the same leadership tier as EXAM_MANAGE_ROLES/
// RESULT_PUBLISH_ROLES, plus REGISTRAR since issuing official student
// records is that role's core function at institutions that have it.
export const DOCUMENT_REQUEST_REVIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "REGISTRAR"];
export const TRANSPORT_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "TRANSPORT_MANAGER"];
export const HOSTEL_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "HOSTEL_MANAGER"];
// Gates the at-risk-students list and guardian-messaging routes — mixes
// financial due data (accounts' domain) with a dropout-risk judgment
// (leadership's domain), confirmed with the product owner as leadership +
// accounts only, not opened to every staff role the way analytics.routes.ts's
// other routes currently are (a known, separately-flagged gap — see the
// module's own comment).
export const ANALYTICS_MESSAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "ACCOUNTANT"];
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
// Gates the new apps/teacher app's own endpoints (schedule/today, my-sections).
export const TEACHER_APP_ROLES: UserRole[] = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT",
];
export const DEVICE_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"];
export const ACCOUNTS_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
export const VOUCHER_APPROVE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "PRINCIPAL"];
export const VOUCHER_POST_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
export const INVENTORY_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
export const REQUISITION_APPROVE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "HEAD_OF_DEPT"];

// Plan Two (Phases 29-37). Every array below explicitly includes both
// "ADMIN" and "SUPER_ADMIN" — all older arrays above were audited and fixed
// to match on 2026-07-11 (see the top-of-file comment).
export const HEALTH_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER"];
export const DISCIPLINE_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER"];
export const COMPLAINT_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const PTM_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER"];
export const APPRAISAL_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const QUIZ_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER"];

// Plan Three (Phases 38-54).
// Broad-reach, gateway-cost-incurring action (can message the whole
// student/staff body at once) — deliberately kept to leadership tier only,
// narrower than WEBSITE_CONTENT_ROLES which IT_ADMIN also has.
export const BULK_SMS_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
