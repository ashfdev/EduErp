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
// The "teaching staff" boundary — used to derive the HR module's Faculty
// vs Staff split (a Staff row whose User.role is in this set is "Faculty"),
// and originally lived only as a local const in staff/staff.routes.ts
// feeding its "assign a teacher" picker; centralized here so both call
// sites can never drift apart.
export const TEACHING_ROLES: UserRole[] = ["CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"];
export const ATTENDANCE_MARK_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
// Same membership as ATTENDANCE_MARK_ROLES — the role gate is identical,
// but subject-wise marking's *ownership* semantics are deliberately
// stricter (no class-teacher-any-period fallback — see
// assertSubjectSectionOwnership in subject-attendance.routes.ts), so this
// stays its own named constant rather than reusing ATTENDANCE_MARK_ROLES
// directly; a future change to one must not silently affect the other.
export const SUBJECT_ATTENDANCE_MARK_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
export const EXAM_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
// CLASS_TEACHER is included here too — a person can simultaneously be the
// homeroom class teacher of one section AND hold a real
// SubjectTeacherAssignment for specific subjects elsewhere (e.g. also
// teaching English in another section). Being let through this role gate is
// necessary but not sufficient: POST /submit still validates every
// submitted subject_id against real SubjectTeacherAssignment rows for
// SUBJECT_TEACHER and CLASS_TEACHER alike, so a class teacher with no real
// subject assignment still can't submit anything.
export const MARK_ENTRY_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER", "CLASS_TEACHER"];
export const MARK_VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER", "CLASS_TEACHER"];
export const MARK_APPROVAL_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const RESULT_PUBLISH_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
export const FEE_COLLECTION_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
// Kept as its own constant (same membership as FEE_COLLECTION_ROLES today)
// rather than reusing it directly, so waiver-request review permission can
// be tuned independently later -- same reasoning already used elsewhere in
// this file for SUBJECT_ATTENDANCE_MARK_ROLES vs. ATTENDANCE_MARK_ROLES.
export const WAIVER_REQUEST_REVIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
export const ADMISSION_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];
// Read-only widening (Plan Twenty-Three, Phase 3) -- an accountant needs to
// see who owes what on an application to collect against it, but every
// mutation route (status change, bulk-action, confirm, enroll, scheduling)
// stays ADMISSION_MANAGE_ROLES-only, matching real separation of duties.
export const ADMISSION_READ_ROLES: UserRole[] = [...ADMISSION_MANAGE_ROLES, "ACCOUNTANT"];
export const ADMISSION_ENROLL_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const WEBSITE_CONTENT_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "IT_ADMIN"];
export const HR_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const LEAVE_APPROVE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"];
export const PAYROLL_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
// Deliberately narrower widening than merging HR_MANAGE_ROLES into
// PAYROLL_MANAGE_ROLES outright — a Principal who onboards staff can now see
// the salary-structure *catalog* (names/amounts, closer to a published pay
// scale) to pick one while adding staff, but still cannot see which named
// staff member is on which structure (staff.routes.ts's canViewPayroll gate
// on the joined relation) or call the assignment/write routes — those stay
// PAYROLL_MANAGE_ROLES-only. Read-only, and only for this one catalog.
export const PAYROLL_READ_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "PRINCIPAL"];
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
