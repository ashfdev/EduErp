"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Input, EmptyState, Button } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AlumniRow {
  id: string;
  student_uid: string;
  name_en: string;
  name_bn?: string | null;
  graduation_year: number | null;
  father_phone?: string | null;
  current_class?: { name_en: string } | null;
}

export default function AlumniPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["students", "alumni", { search, page }],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: { search: search || undefined, status: "GRADUATED", page, limit: 20 },
        })
      ).data,
  });

  const alumni: AlumniRow[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PageWrapper>
      <PageHeader title="Alumni" subtitle={meta ? `Total: ${meta.total}` : undefined} breadcrumbs={[{ label: "Alumni" }]} />

      <Input placeholder="Search name or UID..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

      {!alumni.length && <EmptyState title="No alumni yet" description="Students appear here once marked as graduated from their profile page." />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Student UID</th>
                <th className="p-2">Name</th>
                <th className="p-2">Last Class</th>
                <th className="p-2">Graduation Year</th>
                <th className="p-2">Contact</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {alumni.map((a) => (
                <tr key={a.id} className="border-b hover:bg-accent/40">
                  <td className="p-2 font-mono text-xs">{a.student_uid}</td>
                  <td className="p-2">
                    <div className="font-medium">{a.name_en}</div>
                    {a.name_bn && <div className="text-xs text-muted-foreground">{a.name_bn}</div>}
                  </td>
                  <td className="p-2">{a.current_class?.name_en ?? "—"}</td>
                  <td className="p-2">{a.graduation_year ?? "—"}</td>
                  <td className="p-2">{a.father_phone ?? "—"}</td>
                  <td className="p-2">
                    <Link href={`/students/${a.id}`} className="text-primary hover:underline">
                      View / Update Contact
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {!!meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </PageWrapper>
  );
}
