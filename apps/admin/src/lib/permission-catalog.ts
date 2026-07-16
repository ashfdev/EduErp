// Read-only reference mirroring server/api/src/lib/roles.ts's hardcoded
// role arrays (which is what authorize() actually checks on every request).
// This is documentation, not a live query — same as CLAUDE.md's own
// "Permission Matrix" table, it needs a manual update if a new role array
// is ever added to roles.ts.
export interface PermissionCatalogEntry {
  feature: string;
  roles: string[];
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { feature: "Institution Settings (profile, branding)", roles: ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"] },
  { feature: "Academic Settings (years, shifts, classes, sections)", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
  { feature: "User Accounts & Roles", roles: ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"] },
  { feature: "Student CRUD (add/edit)", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "REGISTRAR"] },
  { feature: "Student Promotion", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
  { feature: "Attendance Marking", roles: ["SUPER_ADMIN", "ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"] },
  { feature: "Exam Setup & Management", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
  { feature: "Mark Entry", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER"] },
  { feature: "Mark Entry — view only", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER", "CLASS_TEACHER"] },
  { feature: "Mark Approval", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
  { feature: "Result Publish", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
  { feature: "Fee Collection", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
  { feature: "Admission — manage cycles/applications", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"] },
  { feature: "Admission — enroll", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
  { feature: "Website Content", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "IT_ADMIN"] },
  { feature: "HR Management (staff records)", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
  { feature: "Leave Approval", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
  { feature: "Payroll", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
  { feature: "Library Management", roles: ["SUPER_ADMIN", "ADMIN", "LIBRARIAN"] },
  { feature: "Transport Management", roles: ["SUPER_ADMIN", "ADMIN", "TRANSPORT_MANAGER"] },
  { feature: "Hostel Management", roles: ["SUPER_ADMIN", "ADMIN", "HOSTEL_MANAGER"] },
  { feature: "At-Risk Students & Guardian Messaging", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "ACCOUNTANT"] },
  { feature: "Bulk SMS", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
  { feature: "Device / Biometric Settings", roles: ["SUPER_ADMIN", "ADMIN", "IT_ADMIN"] },
  { feature: "Accounts (journals, ledger, vouchers)", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
  { feature: "Voucher Approval", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "PRINCIPAL"] },
  { feature: "Inventory & Fixed Assets", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
  { feature: "Purchase Requisition Approval", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "HEAD_OF_DEPT"] },
  { feature: "Student Health Records", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER"] },
  { feature: "Discipline Records", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER"] },
  { feature: "Complaints (manage all)", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
  { feature: "Parent-Teacher Meeting Slots", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER"] },
  { feature: "Staff Performance Appraisals", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL"] },
  { feature: "Quizzes / Online Exams", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "EXAM_CONTROLLER", "SUBJECT_TEACHER"] },
  { feature: "Teacher App (schedule, my-sections)", roles: ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"] },
];
