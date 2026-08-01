"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Image from "next/image";
import { Badge, Button, Card, CardContent, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, Input, Label, LoadingSpinner, PageHeader, PageWrapper, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
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
  resignation_date: string | null;
  department: { name_en: string } | null;
  user: { role: string } | null;
  _count: { documents: number };
  // The raw FK, not the joined salary_structure relation — GET /api/hr/staff
  // uses `include` (not `select`), which always returns every scalar column
  // of the base model regardless of viewer role, unlike the joined relation
  // itself (canViewPayroll-gated). Using the scalar here means this badge is
  // reliable for every viewer, not just PAYROLL_MANAGE_ROLES.
  salary_structure_id: string | null;
}

interface SalaryStructureOption {
  id: string;
  name: string;
}

interface StaffListProps {
  category: "FACULTY" | "STAFF";
  title: string;
  subtitle: string;
  addLabel: string;
}

export function StaffList({ category, title, subtitle, addLabel }: StaffListProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkSalaryStructureId, setBulkSalaryStructureId] = useState("");

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });

  const { data: salaryStructures } = useQuery<SalaryStructureOption[]>({
    queryKey: ["hr", "salary-structures"],
    queryFn: async () => (await api.get("/api/hr/salary-structures")).data.data,
    enabled: bulkAssignOpen,
  });

  const bulkAssignMutation = useMutation({
    mutationFn: () => api.put("/api/hr/staff/salary-structure/bulk", { staff_ids: [...selected], salary_structure_id: bulkSalaryStructureId }),
    onSuccess: (res) => {
      toast.success(`Salary structure assigned to ${res.data.data.updated} staff`);
      queryClient.invalidateQueries({ queryKey: ["hr", "staff"] });
      setBulkAssignOpen(false);
      setSelected(new Set());
      setBulkSalaryStructureId("");
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to assign salary structure";
      toast.error(message);
    },
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: staff, isLoading, isError, error, refetch } = useQuery<StaffRow[]>({
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
            {selected.size > 0 && (
              <Button variant="outline" onClick={() => setBulkAssignOpen(true)}>
                Assign Salary Structure ({selected.size})
              </Button>
            )}
            <Button variant="outline" onClick={downloadExcel}>Export Excel</Button>
            <Button variant="outline" onClick={() => router.push("/hr/staff/bulk-import")}>Bulk Import</Button>
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

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title={`Failed to load ${title.toLowerCase()}`} description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!staff?.length && <EmptyState title={`No ${title.toLowerCase()} found`} />}
      {!!staff?.length && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={!!staff.length && selected.size === staff.length}
                      onCheckedChange={(v) => setSelected(v ? new Set(staff.map((s) => s.id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelected(s.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-muted text-xs">
                        {s.photo_url ? <Image src={s.photo_url} alt="" width={28} height={28} className="h-7 w-7 object-cover" /> : "👤"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/hr/staff/${s.id}`} className="font-medium text-primary hover:underline">{s.name_en}</Link>
                      {s._count.documents === 0 && (
                        <Badge variant="warning" className="ml-2">No documents</Badge>
                      )}
                      {!s.salary_structure_id && (
                        <Badge variant="warning" className="ml-2">No salary structure</Badge>
                      )}
                    </TableCell>
                    <TableCell>{s.designation}</TableCell>
                    <TableCell>{s.department?.name_en ?? "-"}</TableCell>
                    <TableCell><StatusBadge status={s.is_active ? "ACTIVE" : s.resignation_date ? "RESIGNED" : "INACTIVE"} /></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/hr/staff/${s.id}`}>
                        <Button size="sm" variant="outline">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
        </>
      )}

      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Salary Structure — {selected.size} staff</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Salary Structure</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={bulkSalaryStructureId} onChange={(e) => setBulkSalaryStructureId(e.target.value)}>
              <option value="">Select...</option>
              {salaryStructures?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {salaryStructures && salaryStructures.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No salary structures yet. <Link href="/hr/salary-structures" className="text-primary hover:underline">Create one</Link> first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => bulkAssignMutation.mutate()} disabled={!bulkSalaryStructureId || bulkAssignMutation.isPending}>
              {bulkAssignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
