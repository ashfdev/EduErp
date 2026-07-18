"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Badge, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
}

interface StaffRow {
  id: string;
  staff_uid: string;
  name_en: string;
  designation: string;
  photo_url: string | null;
  is_active: boolean;
  department: { name_en: string } | null;
  user: { role: string } | null;
  _count: { documents: number };
}

interface StaffListProps {
  category: "FACULTY" | "STAFF";
  title: string;
  subtitle: string;
  addLabel: string;
}

export function StaffList({ category, title, subtitle, addLabel }: StaffListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });

  const { data: staff } = useQuery<StaffRow[]>({
    queryKey: ["hr", "staff", category, search, departmentId],
    queryFn: async () =>
      (
        await api.get("/api/hr/staff", {
          params: { category, search: search || undefined, department_id: departmentId || undefined, limit: 100 },
        })
      ).data.data,
  });

  async function downloadExcel() {
    const res = await api.get("/api/hr/staff/export", {
      params: { category, search: search || undefined, department_id: departmentId || undefined },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrapper>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: title }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel}>Export Excel</Button>
            <Button onClick={() => router.push(`/hr/staff/new?category=${category}`)}>{addLabel}</Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search by name or staff ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>{d.name_en}</option>
          ))}
        </select>
      </div>

      {!staff?.length && <EmptyState title={`No ${title.toLowerCase()} found`} />}
      {!!staff?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2"></th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Designation</th>
                  <th className="p-2">Department</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="p-2">
                      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-xs">
                        {s.photo_url ? <Image src={s.photo_url} alt="" width={32} height={32} className="h-8 w-8 object-cover" /> : "👤"}
                      </div>
                    </td>
                    <td className="p-2">
                      <Link href={`/hr/staff/${s.id}`} className="text-primary hover:underline">{s.name_en}</Link>
                      {s._count.documents === 0 && (
                        <Badge variant="warning" className="ml-2">No documents</Badge>
                      )}
                    </td>
                    <td className="p-2">{s.designation}</td>
                    <td className="p-2">{s.department?.name_en ?? "-"}</td>
                    <td className="p-2"><StatusBadge status={s.is_active ? "ACTIVE" : "INACTIVE"} /></td>
                    <td className="p-2 text-right">
                      <Link href={`/hr/staff/${s.id}`}>
                        <Button size="sm" variant="outline">View</Button>
                      </Link>
                    </td>
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
