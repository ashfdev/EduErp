"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StaffRow {
  id: string;
  staff_uid: string;
  name_en: string;
  designation: string;
  photo_url: string | null;
  is_active: boolean;
  department: { name_en: string } | null;
  user: { role: string } | null;
}

export default function HrStaffListPage() {
  const [search, setSearch] = useState("");

  const { data: staff } = useQuery<StaffRow[]>({
    queryKey: ["hr", "staff", search],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { search: search || undefined, limit: 100 } })).data.data,
  });

  async function downloadExcel() {
    const res = await api.get("/api/hr/staff/export", { params: { search: search || undefined }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Staff.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Staff"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Staff" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel}>Export Excel</Button>
            <Link href="/hr/staff/new"><Button>+ Add Staff</Button></Link>
          </div>
        }
      />

      <Input placeholder="Search by name or staff ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {!staff?.length && <EmptyState title="No staff found" />}
      {!!staff?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2"></th><th className="p-2">Staff ID</th><th className="p-2">Name</th>
                  <th className="p-2">Designation</th><th className="p-2">Department</th><th className="p-2">Role</th><th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="p-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">
                        {s.photo_url ? <img src={s.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : "👤"}
                      </div>
                    </td>
                    <td className="p-2 font-mono text-xs">{s.staff_uid}</td>
                    <td className="p-2"><Link href={`/hr/staff/${s.id}`} className="text-primary hover:underline">{s.name_en}</Link></td>
                    <td className="p-2">{s.designation}</td>
                    <td className="p-2">{s.department?.name_en ?? "-"}</td>
                    <td className="p-2">{s.user?.role?.replace(/_/g, " ") ?? "-"}</td>
                    <td className="p-2"><StatusBadge status={s.is_active ? "ACTIVE" : "INACTIVE"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
