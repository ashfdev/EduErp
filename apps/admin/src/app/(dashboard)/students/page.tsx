"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentRow {
  id: string;
  student_uid: string;
  name_en: string;
  name_bn?: string | null;
  photo_url?: string | null;
  current_roll_no?: string | null;
  status: string;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
  guardian?: { phone: string } | null;
}

interface ClassOption {
  id: string;
  name_en: string;
}

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  const { data } = useQuery({
    queryKey: ["students", { search, classId, page }],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: { search: search || undefined, class_id: classId || undefined, page, limit: 20 },
        })
      ).data,
  });

  const students: StudentRow[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageWrapper>
      <PageHeader
        title="Students"
        subtitle={meta ? `Total: ${meta.total}` : undefined}
        breadcrumbs={[{ label: "Students" }]}
        action={
          <Link href="/students/new">
            <Button>+ Add Student</Button>
          </Link>
        }
      />

      <div className="flex gap-3">
        <Input placeholder="Search name, UID, roll..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={classId || "all"} onValueChange={(v) => setClassId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!students.length && <EmptyState title="No students found" description="Try adjusting filters or add a new student." />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Student UID</th>
                <th className="p-2">Name</th>
                <th className="p-2">Class / Section</th>
                <th className="p-2">Roll</th>
                <th className="p-2">Guardian Phone</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b hover:bg-accent/40">
                  <td className="p-2 font-mono text-xs">{s.student_uid}</td>
                  <td className="p-2">
                    <div className="font-medium">{s.name_en}</div>
                    {s.name_bn && <div className="text-xs text-muted-foreground">{s.name_bn}</div>}
                  </td>
                  <td className="p-2">{s.current_class?.name_en} {s.current_section && `· ${s.current_section.name}`}</td>
                  <td className="p-2">{s.current_roll_no ?? "—"}</td>
                  <td className="p-2">{s.guardian?.phone ?? "—"}</td>
                  <td className="p-2"><StatusBadge status={s.status} /></td>
                  <td className="p-2">
                    <Link href={`/students/${s.id}`} className="text-primary hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
