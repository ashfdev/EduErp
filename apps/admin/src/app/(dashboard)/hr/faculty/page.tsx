"use client";

import { StaffList } from "@/components/hr/staff-list";

export default function HrFacultyListPage() {
  return (
    <StaffList
      category="FACULTY"
      title="Faculty List"
      subtitle="Teaching staff — class teachers, subject teachers, and heads of department"
      addLabel="+ Add Faculty"
    />
  );
}
