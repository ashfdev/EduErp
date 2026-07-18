"use client";

import { StaffList } from "@/components/hr/staff-list";

export default function HrStaffListPage() {
  return (
    <StaffList
      category="STAFF"
      title="Staff List"
      subtitle="Non-teaching staff — accounts, library, transport, hostel, and other support roles"
      addLabel="+ Add Staff"
    />
  );
}
