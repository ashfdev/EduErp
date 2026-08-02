// Single source of truth for the Settings sidebar's grouped page list —
// imported by both the Settings route layout and the global command-palette
// search (Plan Fifteen, Phase C) so the two can never silently drift apart.
export const SETTINGS_GROUPS = [
  {
    label: "Institution",
    items: [
      { href: "/settings/institution", label: "Profile & Branding" },
      { href: "/settings/academic", label: "Academic Structure" },
      { href: "/settings/departments", label: "Departments" },
      { href: "/settings/programs", label: "Programs & Courses" },
      { href: "/settings/subjects", label: "Subjects" },
      { href: "/settings/routine", label: "Routine / Timetable" },
    ],
  },
  {
    label: "Customization",
    items: [
      { href: "/settings/student-id", label: "Student ID Format" },
      { href: "/settings/grading", label: "Grading System" },
      { href: "/settings/mark-composition-templates", label: "Mark Composition Templates" },
      { href: "/settings/marksheet-display", label: "Marksheet Display" },
      { href: "/settings/fee-rules", label: "Fee Rules" },
      { href: "/settings/admission-payment-instructions", label: "Admission Payment Instructions" },
      { href: "/settings/attendance-rules", label: "Attendance Rules" },
      { href: "/settings/leave-types", label: "Leave Types" },
    ],
  },
  {
    label: "Documents & Signatures",
    items: [
      { href: "/settings/signatures", label: "Authority Signatures" },
      { href: "/settings/signature-mapping", label: "Signature Mapping" },
      { href: "/settings/templates", label: "Document Templates" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings/users", label: "User Accounts" },
      { href: "/settings/permissions", label: "Roles & Permissions" },
      { href: "/settings/notifications", label: "Notifications" },
      { href: "/settings/notifications/logs", label: "Notification Logs" },
      { href: "/notifications/bulk-sms", label: "Bulk SMS" },
      { href: "/settings/payment-gateways", label: "Payment Gateways" },
      { href: "/settings/devices", label: "Biometric Devices" },
      { href: "/settings/audit-log", label: "Audit Log" },
    ],
  },
];
