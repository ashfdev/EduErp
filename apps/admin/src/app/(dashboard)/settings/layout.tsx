import Link from "next/link";

const GROUPS = [
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
      { href: "/settings/exam-types", label: "Exam Types" },
      { href: "/settings/fee-rules", label: "Fee Rules" },
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
      { href: "/settings/notifications", label: "Notifications" },
      { href: "/settings/notifications/logs", label: "Notification Logs" },
      { href: "/settings/devices", label: "Biometric Devices" },
      { href: "/settings/audit-log", label: "Audit Log" },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <aside className="w-60 shrink-0 border-r p-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
            <nav className="flex flex-col gap-1">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
